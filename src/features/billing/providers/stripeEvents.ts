// Tradução do vocabulário do Stripe para o nosso — **função pura**.
//
// Separada do `stripe.ts` pelo mesmo motivo que `webhookSignature.ts` é separada do
// provider: assim dá para testar sem carregar `~/server/env-server` (que exige o ambiente
// inteiro só para existir) e sem instanciar o SDK. O `import type` some na compilação,
// então este arquivo não tem dependência de runtime nenhuma.

import type Stripe from 'stripe'
import type { BillingEvent, SubscriptionStatus } from '../types'

/**
 * `subscription.status` do Stripe → o nosso enum.
 *
 * ⚠️ **O que não está aqui volta `null` de propósito**, e o chamador transforma em
 * `ignored`. Chutar um status desconhecido escreve acesso errado no banco: o gate da
 * Fase 4 lê exatamente esta coluna.
 *
 * ℹ️ `past_due` **corta o acesso** hoje, porque `ACTIVE_SUBSCRIPTION_STATUSES` é só
 * `['active', 'trialing']`. Ou seja: primeira fatura recusada e o conteúdo fecha, mesmo
 * com o Stripe ainda tentando recobrar por dias. É comportamento vigente, não decisão
 * desta tradução — está anotado no `STRIPE_INTEGRATION_TODO.md` como decisão de produto.
 */
export function mapSubscriptionStatus(status: string): SubscriptionStatus | null {
  switch (status) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
    case 'incomplete':
    case 'paused':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'incomplete_expired':
    case 'unpaid':
      return 'expired'
    default:
      return null
  }
}

/**
 * `current_period_end` em epoch ms.
 *
 * 🔴 **Lê os dois formatos de propósito.** A partir da versão de API 2025-03-31 o Stripe
 * moveu os campos de período da assinatura para os **items** dela. Ler só
 * `subscription.current_period_end` funciona numa conta e devolve `undefined` na outra —
 * e `undefined` aqui significa assinatura sem vencimento, que o job de expiração nunca
 * derruba. Falha silenciosa que só aparece meses depois.
 */
export function readCurrentPeriodEnd(sub: Stripe.Subscription): number | undefined {
  const fromItem = sub.items?.data?.[0]?.current_period_end
  const fromRoot = (sub as unknown as { current_period_end?: number }).current_period_end
  const seconds = fromItem ?? fromRoot
  return typeof seconds === 'number' ? seconds * 1000 : undefined
}

/** O id da assinatura numa fatura, nos dois formatos de API. */
export function readInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const parent = (
    invoice as unknown as {
      parent?: { subscription_details?: { subscription?: string | { id: string } } }
    }
  ).parent
  const fromParent = parent?.subscription_details?.subscription
  const fromRoot = (invoice as unknown as { subscription?: string | { id: string } })
    .subscription
  const value = fromParent ?? fromRoot
  if (!value) return undefined
  return typeof value === 'string' ? value : value.id
}

/** Metadata da assinatura numa fatura, nos dois formatos de API. */
function readInvoiceSubscriptionMetadata(
  invoice: Stripe.Invoice,
): Record<string, string> | undefined {
  const parent = (
    invoice as unknown as {
      parent?: { subscription_details?: { metadata?: Record<string, string> } }
    }
  ).parent
  return parent?.subscription_details?.metadata
}

const asId = (value: string | { id: string } | null | undefined) =>
  !value ? undefined : typeof value === 'string' ? value : value.id

/**
 * O evento do Stripe já traduzido.
 *
 * 🔴 **`userId` e `planId` saem do `metadata`.** O webhook só consegue criar a assinatura
 * na primeira notícia se eles vierem (ver o `if (!event.userId || !event.planId)` em
 * `app/api/billing/webhook/[provider]+api.ts`). É por isso que o `createCheckout` grava o
 * metadata **também em `subscription_data`**, e não só na sessão: os eventos
 * `customer.subscription.*` carregam o metadata da assinatura, não o da sessão.
 */
export function mapStripeEvent(event: Stripe.Event): BillingEvent {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      // Compra avulsa (`plan.interval === 'once'`): não existe Subscription do lado do
      // Stripe, então este evento é a **única** notícia da compra.
      //
      // ⚠️ Sai daqui **sem `currentPeriodEnd`** de propósito: o prazo vem de
      // `plan.accessDays`, que está no banco, e esta função é pura. Quem completa é o
      // `parseWebhook` em `stripe.ts`. Sem esse complemento a concessão nasceria sem
      // vencimento — ou seja, avulso viraria vitalício.
      if (session.mode === 'payment') {
        if (session.payment_status !== 'paid') {
          return { type: 'ignored', reason: `sessão avulsa não paga: ${session.payment_status}` }
        }
        return {
          type: 'subscription.updated',
          userId: session.metadata?.userId,
          planId: session.metadata?.planId,
          status: 'active',
        }
      }

      const providerSubscriptionId = asId(session.subscription)
      if (!providerSubscriptionId) {
        return { type: 'ignored', reason: 'sessão de assinatura sem assinatura' }
      }
      return {
        type: 'subscription.updated',
        providerSubscriptionId,
        userId: session.metadata?.userId,
        planId: session.metadata?.planId,
        // o status real chega no `customer.subscription.*` que vem logo atrás; a rota faz
        // criar-ou-atualizar pelo `providerSubscriptionId`, então ele se corrige sozinho
        status: 'active',
      }
    }

    /**
     * Pagamento de compra avulsa.
     *
     * 🔴 **Só quando não há fatura.** Assinatura gera `invoice.paid` *e*
     * `payment_intent.succeeded` para o mesmo dinheiro, com ids diferentes — e
     * `recordPayment` deduplica por `providerPaymentId`, então o id diferente passaria
     * pela checagem e gravaria o pagamento **duas vezes**, inflando o faturamento do
     * `/api/admin/people`. PaymentIntent sem `invoice` é exatamente o caso avulso.
     */
    case 'payment_intent.succeeded': {
      const intent = event.data.object as Stripe.PaymentIntent
      const invoice = (intent as unknown as { invoice?: string | { id: string } }).invoice
      if (invoice) {
        return { type: 'ignored', reason: 'pagamento de fatura: já contado por invoice.paid' }
      }
      return {
        type: 'payment.succeeded',
        providerPaymentId: intent.id,
        userId: intent.metadata?.userId,
        amountCents: intent.amount_received,
        currency: intent.currency?.toUpperCase(),
        paidAt: intent.created ? intent.created * 1000 : undefined,
      }
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const status =
        event.type === 'customer.subscription.deleted'
          ? 'canceled'
          : mapSubscriptionStatus(sub.status)

      if (!status) {
        return { type: 'ignored', reason: `status desconhecido: ${sub.status}` }
      }

      return {
        type: 'subscription.updated',
        providerSubscriptionId: sub.id,
        userId: sub.metadata?.userId,
        planId: sub.metadata?.planId,
        status,
        currentPeriodEnd: readCurrentPeriodEnd(sub),
      }
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      if (!invoice.id) return { type: 'ignored', reason: 'fatura sem id' }

      return {
        type: 'payment.succeeded',
        // id da fatura, e não algo gerado aqui: o Stripe reenvia webhook, e
        // `recordPayment` deduplica exatamente por este campo
        providerPaymentId: invoice.id,
        providerSubscriptionId: readInvoiceSubscriptionId(invoice),
        // ⚠️ a fatura pode chegar **antes** do `checkout.session.completed`. Sem o dono
        // vindo do metadata, o primeiro pagamento entraria órfão e o faturamento do
        // `/api/admin/people` somaria errado
        userId: readInvoiceSubscriptionMetadata(invoice)?.userId,
        amountCents: invoice.amount_paid,
        currency: invoice.currency?.toUpperCase(),
        paidAt: invoice.status_transitions?.paid_at
          ? invoice.status_transitions.paid_at * 1000
          : undefined,
      }
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const providerSubscriptionId = readInvoiceSubscriptionId(invoice)
      if (!providerSubscriptionId) {
        return { type: 'ignored', reason: 'fatura recusada sem assinatura' }
      }
      return {
        type: 'subscription.updated',
        providerSubscriptionId,
        userId: readInvoiceSubscriptionMetadata(invoice)?.userId,
        planId: readInvoiceSubscriptionMetadata(invoice)?.planId,
        status: 'past_due',
      }
    }

    default:
      return { type: 'ignored', reason: `tipo não tratado: ${event.type}` }
  }
}
