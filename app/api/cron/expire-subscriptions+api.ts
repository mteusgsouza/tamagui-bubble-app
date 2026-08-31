// POST /api/cron/expire-subscriptions — vira assinaturas vencidas para `expired`.
//
// **Por que isto precisa existir:** o gate do paywall (Fase 4) filtra por
// `subscription.status`, não por data — comparar com "agora" dentro de uma permission
// quebraria a convergência cliente/servidor que o Zero exige. O preço dessa escolha é
// esta rota: sem alguém chamá-la, assinatura vencida libera conteúdo para sempre.
//
// Quem chama é um agendador externo (Vercel Cron, GitHub Actions, cron da VPS) com
// `Authorization: Bearer $CRON_SECRET`. Sem `CRON_SECRET` definido a rota fica fechada —
// aberta ela não vaza dados, mas deixa qualquer um forçar trabalho no banco.

import { expireOverdueSubscriptions } from '~/features/billing/server/subscriptionActions'
import { CRON_SECRET } from '~/server/env-server'

import type { Endpoint } from 'one'

const authorized = (request: Request) => {
  if (!CRON_SECRET) return false
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : header
  return token === CRON_SECRET
}

const run = async (request: Request) => {
  if (!authorized(request)) {
    return Response.json(
      {
        error: CRON_SECRET
          ? 'Token inválido.'
          : 'CRON_SECRET não está definido — a rota fica fechada até ter segredo.',
        code: 'unauthorized',
      },
      { status: 401 },
    )
  }

  const result = await expireOverdueSubscriptions()
  console.info(`[cron] expire-subscriptions: ${result.expired} expirada(s)`)
  return Response.json({ ok: true, ...result })
}

export const POST: Endpoint = run
// GET também: alguns agendadores (Vercel Cron) só fazem GET
export const GET: Endpoint = run
