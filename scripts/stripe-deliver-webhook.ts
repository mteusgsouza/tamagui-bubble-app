#!/usr/bin/env bun

/**
 * @description Entrega ao servidor local o `payment_intent.succeeded` de uma compra **real**
 * feita no Stripe test mode — para quando não há `stripe listen` e o Stripe não alcança o
 * `localhost`.
 *
 *   bun run:dev scripts/stripe-deliver-webhook.ts            # a última sessão paga
 *   bun run:dev scripts/stripe-deliver-webhook.ts cs_test_... # uma sessão específica
 *   bun run:dev scripts/stripe-deliver-webhook.ts --times 2   # reenvia (prova a idempotência)
 *
 * O PaymentIntent, o valor e o metadata vêm do Stripe; só a **entrega** é nossa, assinada
 * com `STRIPE_WEBHOOK_SECRET` do mesmo jeito que o Stripe assinaria. O servidor valida a
 * assinatura normalmente, então o caminho exercido é o de produção.
 */

import Stripe from 'stripe'

const KEY = process.env.STRIPE_SECRET_KEY
const SECRET = process.env.STRIPE_WEBHOOK_SECRET
const BASE = process.env.ONE_SERVER_URL || 'http://localhost:8081'

if (!KEY || !SECRET) {
  console.error('❌ STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET precisam estar no ambiente.')
  process.exit(1)
}
if (!KEY.startsWith('sk_test_')) {
  console.error('❌ Só roda em test mode (a chave não é sk_test_).')
  process.exit(1)
}

const args = process.argv.slice(2)
const timesIdx = args.indexOf('--times')
const times = timesIdx >= 0 ? Number(args[timesIdx + 1]) || 1 : 1
const sessionArg = args.find((a) => a.startsWith('cs_'))

const stripe = new Stripe(KEY)

async function main() {
  const session = sessionArg
    ? await stripe.checkout.sessions.retrieve(sessionArg)
    : (await stripe.checkout.sessions.list({ limit: 20 })).data.find(
        (s) => s.payment_status === 'paid' && s.mode === 'payment',
      )

  if (!session) {
    console.error('❌ Nenhuma sessão avulsa paga encontrada.')
    process.exit(1)
  }

  const intentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id
  if (!intentId) {
    console.error(`❌ A sessão ${session.id} não tem payment_intent.`)
    process.exit(1)
  }

  const intent = await stripe.paymentIntents.retrieve(intentId)
  const payload = JSON.stringify({
    id: `evt_local_${Date.now()}`,
    object: 'event',
    type: 'payment_intent.succeeded',
    data: { object: intent },
  })

  console.log(`sessão ${session.id} · ${intent.id} · ${intent.amount_received} · metadata`, intent.metadata)

  for (let i = 1; i <= times; i++) {
    const header = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: SECRET!,
    })
    const res = await fetch(`${BASE}/api/billing/webhook/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': header },
      body: payload,
    })
    console.log(`entrega ${i}: ${res.status} ${await res.text()}`)
  }
}

main().catch((err) => {
  console.error('❌ falhou:', err instanceof Error ? err.message : err)
  process.exit(1)
})
