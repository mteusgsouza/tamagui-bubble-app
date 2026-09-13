import { describe, expect, it } from 'vitest'

import {
  mapStripeEvent,
  mapSubscriptionStatus,
  readCurrentPeriodEnd,
  readInvoiceSubscriptionId,
} from '~/features/billing/providers/stripeEvents'

import type Stripe from 'stripe'

/** Evento mínimo — só o que o mapeador lê. */
const event = (type: string, object: unknown) =>
  ({ type, data: { object } }) as unknown as Stripe.Event

const META = { userId: 'u-1', planId: 'plan-mensal' }

describe('mapSubscriptionStatus', () => {
  it('traduz os status conhecidos', () => {
    expect(mapSubscriptionStatus('active')).toBe('active')
    expect(mapSubscriptionStatus('trialing')).toBe('trialing')
    expect(mapSubscriptionStatus('past_due')).toBe('past_due')
    expect(mapSubscriptionStatus('canceled')).toBe('canceled')
    expect(mapSubscriptionStatus('unpaid')).toBe('expired')
  })

  it('devolve null no desconhecido em vez de chutar', () => {
    // chutar aqui escreveria acesso errado no banco: o gate lê exatamente esta coluna
    expect(mapSubscriptionStatus('alguma_coisa_nova')).toBeNull()
  })
})

describe('readCurrentPeriodEnd', () => {
  it('lê do item da assinatura (API 2025-03-31 em diante)', () => {
    const sub = { items: { data: [{ current_period_end: 1000 }] } } as unknown as Stripe.Subscription
    expect(readCurrentPeriodEnd(sub)).toBe(1_000_000)
  })

  it('cai para a raiz na API antiga', () => {
    const sub = { current_period_end: 2000 } as unknown as Stripe.Subscription
    expect(readCurrentPeriodEnd(sub)).toBe(2_000_000)
  })

  it('devolve undefined quando não há nenhum dos dois', () => {
    expect(readCurrentPeriodEnd({} as Stripe.Subscription)).toBeUndefined()
  })
})

describe('readInvoiceSubscriptionId', () => {
  it('lê dos dois formatos de fatura', () => {
    const novo = {
      parent: { subscription_details: { subscription: 'sub_novo' } },
    } as unknown as Stripe.Invoice
    const antigo = { subscription: 'sub_antigo' } as unknown as Stripe.Invoice

    expect(readInvoiceSubscriptionId(novo)).toBe('sub_novo')
    expect(readInvoiceSubscriptionId(antigo)).toBe('sub_antigo')
  })
})

describe('checkout.session.completed', () => {
  it('assinatura: carrega o id do Stripe e o metadata', () => {
    const result = mapStripeEvent(
      event('checkout.session.completed', {
        mode: 'subscription',
        subscription: 'sub_123',
        metadata: META,
      }),
    )

    expect(result).toMatchObject({
      type: 'subscription.updated',
      providerSubscriptionId: 'sub_123',
      userId: 'u-1',
      planId: 'plan-mensal',
      status: 'active',
    })
  })

  it('avulsa: sai SEM prazo e SEM id de assinatura', () => {
    // é o contrato com o `parseWebhook`, que completa o `currentPeriodEnd` a partir de
    // `plan.accessDays`. Se este teste começar a ver um `currentPeriodEnd` aqui, alguém
    // moveu a regra para dentro da função pura — e ela não tem banco para consultar.
    const result = mapStripeEvent(
      event('checkout.session.completed', {
        mode: 'payment',
        payment_status: 'paid',
        metadata: { userId: 'u-1', planId: 'plan-trial' },
      }),
    )

    expect(result).toMatchObject({
      type: 'subscription.updated',
      userId: 'u-1',
      planId: 'plan-trial',
      status: 'active',
    })
    expect(result).not.toHaveProperty('providerSubscriptionId')
    expect((result as { currentPeriodEnd?: number }).currentPeriodEnd).toBeUndefined()
  })

  it('avulsa não paga não concede acesso', () => {
    const result = mapStripeEvent(
      event('checkout.session.completed', {
        mode: 'payment',
        payment_status: 'unpaid',
        metadata: META,
      }),
    )
    expect(result.type).toBe('ignored')
  })
})

describe('customer.subscription.*', () => {
  it('deleted vira canceled mesmo com outro status no objeto', () => {
    const result = mapStripeEvent(
      event('customer.subscription.deleted', {
        id: 'sub_123',
        status: 'active',
        metadata: META,
      }),
    )
    expect(result).toMatchObject({ status: 'canceled', providerSubscriptionId: 'sub_123' })
  })

  it('updated traz o vencimento do item', () => {
    const result = mapStripeEvent(
      event('customer.subscription.updated', {
        id: 'sub_123',
        status: 'past_due',
        metadata: META,
        items: { data: [{ current_period_end: 1700 }] },
      }),
    )
    expect(result).toMatchObject({ status: 'past_due', currentPeriodEnd: 1_700_000 })
  })

  it('status desconhecido é ignorado, não adivinhado', () => {
    const result = mapStripeEvent(
      event('customer.subscription.updated', { id: 'sub_123', status: 'zzz' }),
    )
    expect(result.type).toBe('ignored')
  })
})

describe('pagamento', () => {
  it('invoice.paid usa o id da fatura e acha o dono pelo metadata', () => {
    // a fatura pode chegar antes do `checkout.session.completed`; sem o metadata o
    // primeiro pagamento entraria órfão e o faturamento somaria errado
    const result = mapStripeEvent(
      event('invoice.paid', {
        id: 'in_123',
        amount_paid: 1000,
        currency: 'brl',
        parent: { subscription_details: { subscription: 'sub_123', metadata: META } },
        status_transitions: { paid_at: 1500 },
      }),
    )

    expect(result).toMatchObject({
      type: 'payment.succeeded',
      providerPaymentId: 'in_123',
      providerSubscriptionId: 'sub_123',
      userId: 'u-1',
      amountCents: 1000,
      currency: 'BRL',
      paidAt: 1_500_000,
    })
  })

  it('payment_intent.succeeded sem fatura conta (é o avulso)', () => {
    const result = mapStripeEvent(
      event('payment_intent.succeeded', {
        id: 'pi_123',
        amount_received: 1000,
        currency: 'brl',
        metadata: { userId: 'u-1', planId: 'plan-trial' },
        created: 1500,
      }),
    )

    expect(result).toMatchObject({
      type: 'payment.succeeded',
      providerPaymentId: 'pi_123',
      amountCents: 1000,
    })
  })

  it('🔴 payment_intent.succeeded COM fatura é ignorado — senão conta o dinheiro duas vezes', () => {
    // assinatura dispara `invoice.paid` E `payment_intent.succeeded` para a mesma
    // cobrança, com ids diferentes. Como `recordPayment` deduplica por
    // `providerPaymentId`, o id diferente passaria e gravaria dois pagamentos.
    const result = mapStripeEvent(
      event('payment_intent.succeeded', {
        id: 'pi_123',
        invoice: 'in_123',
        amount_received: 1000,
        currency: 'brl',
      }),
    )
    expect(result.type).toBe('ignored')
  })

  it('invoice.payment_failed vira past_due', () => {
    const result = mapStripeEvent(
      event('invoice.payment_failed', {
        id: 'in_123',
        parent: { subscription_details: { subscription: 'sub_123', metadata: META } },
      }),
    )
    expect(result).toMatchObject({ type: 'subscription.updated', status: 'past_due' })
  })
})

describe('evento não tratado', () => {
  it('vira ignored, e a rota responde 200 para o gateway não reenviar para sempre', () => {
    const result = mapStripeEvent(event('customer.created', { id: 'cus_1' }))
    expect(result.type).toBe('ignored')
  })
})
