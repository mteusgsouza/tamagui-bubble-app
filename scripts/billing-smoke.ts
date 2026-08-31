// Smoke do fluxo de cobrança, ponta a ponta contra o servidor de dev.
//
//   bun run:dev scripts/billing-smoke.ts [userId] [planId]
//
// ⚠️ **`bun run:dev scripts/...`, não `bun run:dev bun scripts/...`** — o segundo vira
// `bun bun`, o bundler de browser antigo, e quebra em "cannot require Node.js builtin".
//
// Sem argumentos ele roda só as recusas (assinatura errada, token de cron errado), que é
// o que importa validar sempre. Com `userId` e `planId` ele também concede, cobra e
// cancela de verdade — use um usuário de teste.

import { createHmac } from 'node:crypto'

const BASE = process.env.ONE_SERVER_URL || 'http://localhost:8081'
const SECRET = process.env.BILLING_WEBHOOK_SECRET || ''
const CRON = process.env.CRON_SECRET || ''

const [, , userId, planId] = process.argv

let failures = 0

const sign = (body: string) => createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')

async function check(
  label: string,
  expected: number,
  run: () => Promise<Response>
): Promise<any> {
  const res = await run()
  const text = await res.text()
  let parsed: any = text
  try {
    parsed = JSON.parse(text)
  } catch {}

  const ok = res.status === expected
  if (!ok) failures++
  console.info(
    `${ok ? '✅' : '❌'} ${label}\n   ${res.status} (esperado ${expected}) ${text.slice(0, 160)}`
  )
  return parsed
}

const postWebhook = (body: string, signature: string) =>
  fetch(`${BASE}/api/billing/webhook/generic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': signature },
    body,
  })

async function main() {
  console.info(`servidor: ${BASE}`)
  if (!SECRET) {
    console.error('BILLING_WEBHOOK_SECRET vazio — defina em .env.development.')
    process.exit(1)
  }

  // --- o que precisa ser recusado ---

  const body = JSON.stringify({
    type: 'payment.succeeded',
    providerPaymentId: `pay-smoke-${Date.now()}`,
    amountCents: 2990,
    userId: userId || 'usuario-que-nao-existe',
  })

  await check('webhook sem assinatura', 401, () => postWebhook(body, ''))

  await check('webhook com assinatura de outro segredo', 401, () =>
    postWebhook(body, createHmac('sha256', 'outro').update(body).digest('hex'))
  )

  await check('webhook com corpo adulterado depois de assinado', 401, () =>
    postWebhook(body.replace('2990', '1'), sign(body))
  )

  await check('webhook de provider inexistente', 404, () =>
    fetch(`${BASE}/api/billing/webhook/nao-existe`, { method: 'POST', body: '{}' })
  )

  await check('cron sem token', 401, () =>
    fetch(`${BASE}/api/cron/expire-subscriptions`, { method: 'POST' })
  )

  await check('cron com token errado', 401, () =>
    fetch(`${BASE}/api/cron/expire-subscriptions`, {
      method: 'POST',
      headers: { authorization: 'Bearer errado' },
    })
  )

  await check('checkout sem sessão', 401, () =>
    fetch(`${BASE}/api/billing/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planId: planId || 'x' }),
    })
  )

  // --- o que precisa passar ---

  await check('cron com token certo', 200, () =>
    fetch(`${BASE}/api/cron/expire-subscriptions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${CRON}` },
    })
  )

  // pagamento de dono desconhecido: 200 de propósito, senão o gateway reenvia para sempre
  await check('webhook assinado, pagamento sem dono conhecido', 200, () =>
    postWebhook(body, sign(body))
  )

  if (userId && planId) {
    const subBody = JSON.stringify({
      type: 'subscription.updated',
      providerSubscriptionId: `gw-smoke-${Date.now()}`,
      userId,
      planId,
      status: 'active',
      currentPeriodEnd: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })

    const created = await check('webhook cria assinatura', 200, () =>
      postWebhook(subBody, sign(subBody))
    )

    if (created?.subscriptionId) {
      const payBody = JSON.stringify({
        type: 'payment.succeeded',
        providerPaymentId: `pay-smoke-real-${Date.now()}`,
        subscriptionId: created.subscriptionId,
        amountCents: 2990,
        userId,
      })

      const first = await check('webhook registra pagamento', 200, () =>
        postWebhook(payBody, sign(payBody))
      )
      const again = await check('mesmo pagamento reenviado', 200, () =>
        postWebhook(payBody, sign(payBody))
      )

      // gateway reenvia webhook o tempo todo; sem idempotência o faturamento dobra
      if (!first?.recorded || !again?.duplicate) {
        failures++
        console.error('❌ o segundo envio do mesmo pagamento deveria ser duplicate')
      } else {
        console.info('✅ pagamento idempotente por providerPaymentId')
      }
    }
  } else {
    console.info('\nℹ️  passe userId e planId para testar também conceder/cobrar.')
  }

  console.info(failures === 0 ? '\n✅ tudo certo' : `\n❌ ${failures} falha(s)`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
