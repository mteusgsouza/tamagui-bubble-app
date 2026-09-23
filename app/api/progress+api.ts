// POST /api/progress — a posição do player numa aula.
//
// Chamado a cada 10 s pelo throttle de `useLessonProgress`, e no unmount. Upsert puro,
// idempotente por construção.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, readJson } from '~/server/api/respond'
import { saveProgress } from '~/server/content/interactions'

import type { Endpoint } from 'one'

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const body = await readJson<{
    lessonId?: unknown
    positionSec?: unknown
    completed?: unknown
  }>(request)
  if (!body) return FAIL.invalidJson()

  const lessonId = typeof body.lessonId === 'string' ? body.lessonId : ''
  if (!lessonId) return FAIL.missingFields('Falta a aula.')

  const positionSec = Number(body.positionSec)
  if (!Number.isFinite(positionSec)) {
    return FAIL.missingFields('`positionSec` tem que ser número.')
  }

  try {
    const viewer = await loadViewer(auth)
    const result = await saveProgress(viewer, {
      lessonId,
      positionSec,
      completed: body.completed === true,
    })
    if (!result.ok) return fail(result.status, result.code, result.message)
    return Response.json({
      lessonId: result.lessonId,
      positionSec: result.positionSec,
      completedAt: result.completedAt,
    })
  } catch (error) {
    console.error('[progress] falhou', error)
    return fail(500, 'progress-failed', 'Não deu para salvar seu progresso.')
  }
}
