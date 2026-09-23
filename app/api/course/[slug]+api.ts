// GET /api/course/<slug> — um curso com o currículo inteiro.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { MASTER_USER_ID } from '~/constants/creator'
import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, pathParam } from '~/server/api/respond'
import { loadCourseBySlug } from '~/server/content/courses'

import type { Endpoint } from 'one'

const SLUG_FROM_PATH = /\/api\/course\/([^/]+)\/?$/

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()
  if (!MASTER_USER_ID) return fail(503, 'no-creator', 'O catálogo não tem dono configurado.')

  const slug = pathParam(request, SLUG_FROM_PATH)
  if (!slug) return fail(400, 'invalid-slug', 'Curso inválido.')

  try {
    const viewer = await loadViewer(auth)
    const course = await loadCourseBySlug(viewer, { feedOwnerId: MASTER_USER_ID, slug })
    // 404 também para curso fechado: a tela não deve revelar o que existe atrás do paywall
    if (!course) return FAIL.notFound('Curso indisponível.')
    return Response.json({ course })
  } catch (error) {
    console.error('[course] falhou', error)
    return fail(500, 'course-failed', 'Não deu para carregar o curso.')
  }
}
