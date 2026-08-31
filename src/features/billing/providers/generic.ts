// Provider genérico com HMAC — referência e alvo de teste.
//
// Serve dois propósitos:
//
// 1. **Torna o webhook testável hoje**, sem contratar gateway. O `manual` não recebe
//    webhook, então sem este provider o `/api/billing/webhook/*` seria código que nunca
//    roda até alguém escolher um gateway — e código que nunca roda não está certo, está
//    não-testado.
// 2. **É o exemplo de como escrever o próximo.** Stripe, Asaas e Pagar.me mudam o nome
//    do cabeçalho e o formato do corpo; a forma é esta.
//
// Esquema: cabeçalho `x-signature` com o HMAC-SHA256 hex do **corpo cru**, chaveado por
// `BILLING_WEBHOOK_SECRET`.

import { BILLING_WEBHOOK_SECRET } from '~/server/env-server'

import { verifyHmac } from '../webhookSignature'

import type { BillingProvider, SubscriptionStatus } from '../types'

const STATUSES: SubscriptionStatus[] = [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
]

export const genericProvider: BillingProvider = {
  id: 'generic',
  label: 'Gateway genérico (HMAC)',

  async createCheckout() {
    // um gateway de verdade devolveria a URL da página de pagamento dele
    throw new Error(
      'O provider `generic` só recebe webhook; ele não abre checkout. ' +
        'Use `manual` para conceder, ou escreva o provider do seu gateway.',
    )
  },

  async cancel() {
    throw new Error('O provider `generic` não cancela — não há gateway do outro lado.')
  },

  async parseWebhook({ rawBody, headers }) {
    const signature = headers.get('x-signature') || ''
    verifyHmac(rawBody, signature, BILLING_WEBHOOK_SECRET)

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return { type: 'ignored', reason: 'corpo não é JSON' }
    }

    if (body?.type === 'subscription.updated') {
      const status = STATUSES.includes(body.status) ? body.status : null
      if (!status) {
        return { type: 'ignored', reason: `status desconhecido: ${body.status}` }
      }
      return {
        type: 'subscription.updated',
        subscriptionId: body.subscriptionId,
        providerSubscriptionId: body.providerSubscriptionId,
        userId: body.userId,
        planId: body.planId,
        status,
        currentPeriodEnd: body.currentPeriodEnd,
      }
    }

    if (body?.type === 'payment.succeeded') {
      if (!body.providerPaymentId || typeof body.amountCents !== 'number') {
        return { type: 'ignored', reason: 'faltam providerPaymentId ou amountCents' }
      }
      return {
        type: 'payment.succeeded',
        providerPaymentId: String(body.providerPaymentId),
        providerSubscriptionId: body.providerSubscriptionId,
        subscriptionId: body.subscriptionId,
        userId: body.userId,
        amountCents: body.amountCents,
        currency: body.currency,
        paidAt: body.paidAt,
      }
    }

    return { type: 'ignored', reason: `tipo não tratado: ${body?.type}` }
  },
}
