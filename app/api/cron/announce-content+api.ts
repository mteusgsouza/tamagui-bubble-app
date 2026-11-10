// POST /api/cron/announce-content — avisa post novo e aula nova (Fase 22).
//
// Mesmo padrão de `expire-subscriptions`: agendador externo com
// `Authorization: Bearer $CRON_SECRET`; sem `CRON_SECRET` a rota fica fechada.
//
// ⚠️ Ninguém agenda este cron ainda — é a mesma pendência de `expire-subscriptions`.
// Sem agendador em produção, o aviso não sai sozinho.

import { runAnnounceJob } from '~/server/content/announceJob'
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

  try {
    const result = await runAnnounceJob()
    if (result.ok) {
      console.info(
        `[cron] announce-content: ${result.posts.sent} e-mail(s) de post, ${result.lessons.sent} de aula`,
      )
    }
    return Response.json(result)
  } catch (error) {
    console.error('[cron] announce-content falhou', error)
    return Response.json({ ok: false, code: 'announce-failed' }, { status: 500 })
  }
}

export const POST: Endpoint = run
export const GET: Endpoint = run
