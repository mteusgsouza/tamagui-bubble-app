// POST /api/billing/webhook/[provider]
//
// Recebe o evento do gateway, **valida a assinatura**, normaliza e escreve.
//
// ⚠️ Quem chama aqui é o gateway, não uma sessão — não há cookie nem JWT para conferir.
// A única prova de origem é o HMAC do corpo. Por isso a validação vive dentro do
// `parseWebhook` de cada provider e **lança** quando não bate: um webhook que aceita
// corpo não assinado é a base de assinaturas aberta para quem descobrir a URL.

import { providerById } from '~/features/billing/registry'
import { WebhookSignatureError } from '~/features/billing/webhookSignature'
import {
  findSubscription,
  grantSubscription,
  recordPayment,
  setSubscriptionStatus,
} from '~/features/billing/server/subscriptionActions'
import { MASTER_USER_ID } from '~/constants/creator'

import type { Endpoint } from 'one'

const PROVIDER_FROM_PATH = /\/api\/billing\/webhook\/([^/?]+)/

const fail = (status: number, code: string, message: string) =>
  Response.json({ error: message, code }, { status })

export const POST: Endpoint = async (request) => {
  const url = new URL(request.url)
  const providerId = PROVIDER_FROM_PATH.exec(url.pathname)?.[1]
  if (!providerId) return fail(400, 'no-provider', 'Provider ausente na URL.')

  const provider = providerById(decodeURIComponent(providerId))
  if (!provider)
    return fail(404, 'unknown-provider', `Provider desconhecido: ${providerId}`)

  // o corpo **cru** é o que foi assinado — reserializar o JSON mudaria os bytes
  const rawBody = await request.text()

  let event
  try {
    event = await provider.parseWebhook({ rawBody, headers: request.headers })
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      console.warn(`[billing] webhook recusado (${providerId}): ${err.message}`)
      return fail(401, 'bad-signature', err.message)
    }
    console.error(`[billing] webhook falhou (${providerId})`, err)
    return fail(400, 'parse-failed', err instanceof Error ? err.message : 'Erro.')
  }

  if (event.type === 'ignored') {
    // 200 de propósito: gateway que recebe erro fica reenviando para sempre
    return Response.json({ ok: true, ignored: true, reason: event.reason })
  }

  if (event.type === 'subscription.updated') {
    const found = await findSubscription({
      subscriptionId: event.subscriptionId,
      providerSubscriptionId: event.providerSubscriptionId,
    })

    if (found) {
      await setSubscriptionStatus(found.id, event.status, event.currentPeriodEnd)
      return Response.json({ ok: true, subscriptionId: found.id, action: 'updated' })
    }

    // primeira notícia desta assinatura: só dá para criar com userId e planId
    if (!event.userId || !event.planId) {
      return Response.json({
        ok: true,
        ignored: true,
        reason: 'assinatura desconhecida e o evento não traz userId/planId',
      })
    }

    const granted = await grantSubscription({
      userId: event.userId,
      creatorId: MASTER_USER_ID,
      planId: event.planId,
      provider: provider.id,
      providerSubscriptionId: event.providerSubscriptionId,
      status: event.status,
      currentPeriodEnd: event.currentPeriodEnd,
    })

    if (!granted.ok) {
      // 422 e não 200: isto é pagamento recebido que não virou acesso. O gateway marca o
      // webhook como falho no painel dele, que é exatamente o alarme que se quer aqui.
      console.error(`[billing] webhook não conseguiu conceder: ${granted.message}`)
      return fail(422, granted.code, granted.message)
    }
    return Response.json({
      ok: true,
      subscriptionId: granted.subscriptionId,
      action: 'created',
    })
  }

  // payment.succeeded
  const found = await findSubscription({
    subscriptionId: event.subscriptionId,
    providerSubscriptionId: event.providerSubscriptionId,
  })

  const userId = event.userId || found?.userId
  if (!userId) {
    return Response.json({
      ok: true,
      ignored: true,
      reason: 'pagamento sem dono: nem userId no evento, nem assinatura conhecida',
    })
  }

  const result = await recordPayment({
    userId,
    subscriptionId: found?.id ?? null,
    provider: provider.id,
    providerPaymentId: event.providerPaymentId,
    amountCents: event.amountCents,
    currency: event.currency,
    paidAt: event.paidAt,
  })

  return Response.json({ ok: true, ...result })
}
