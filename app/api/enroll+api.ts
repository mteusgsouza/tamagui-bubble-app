// POST /api/enroll — a pessoa se matricula num curso. Ato explícito, idempotente.
//
// O servidor decide (nunca o cliente): ver `enroll` em `src/server/content/enrollments.ts`.
// Sem direito → 422 com o motivo (`needs-purchase`, `needs-plan`, `needs-subscription`), que
// é o sinal para a tela oferecer compra ou assinatura em vez de matrícula.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, readJson } from '~/server/api/respond'
import { enroll } from '~/server/content/enrollments'

import type { Endpoint } from 'one'

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const body = await readJson<{ courseId?: unknown }>(request)
  if (!body) return FAIL.invalidJson()

  const courseId = typeof body.courseId === 'string' ? body.courseId : ''
  if (!courseId) return FAIL.missingFields('Falta o curso.')

  try {
    const viewer = await loadViewer(auth)
    const result = await enroll(viewer, { courseId })
    if (!result.ok) return fail(result.status, result.code, result.message)
    return Response.json({
      ok: true,
      enrollmentId: result.enrollmentId,
      source: result.source,
    })
  } catch (error) {
    console.error('[enroll] falhou', error)
    return fail(500, 'enroll-failed', 'Não deu para abrir o curso. Tente de novo.')
  }
}
