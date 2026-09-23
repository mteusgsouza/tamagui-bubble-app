// GET /api/lesson/<id> — a aula do player, com módulo e curso no contexto.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, pathParam } from '~/server/api/respond'
import { loadLessonDetail } from '~/server/content/courses'

import type { Endpoint } from 'one'

const ID_FROM_PATH = /\/api\/lesson\/([^/]+)\/?$/

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const lessonId = pathParam(request, ID_FROM_PATH)
  if (!lessonId) return fail(400, 'invalid-id', 'Aula inválida.')

  try {
    const viewer = await loadViewer(auth)
    const lesson = await loadLessonDetail(viewer, lessonId)
    if (!lesson) return FAIL.notFound('Aula indisponível.')
    return Response.json({ lesson })
  } catch (error) {
    console.error('[lesson] falhou', error)
    return fail(500, 'lesson-failed', 'Não deu para carregar a aula.')
  }
}
