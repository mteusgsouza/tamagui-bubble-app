// GET /api/courses — os cursos visíveis para o visitante, com módulos, aulas e progresso.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { MASTER_USER_ID } from '~/constants/creator'
import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL } from '~/server/api/respond'
import { loadCourses } from '~/server/content/courses'

import type { Endpoint } from 'one'

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()
  if (!MASTER_USER_ID) return fail(503, 'no-creator', 'O catálogo não tem dono configurado.')

  try {
    const viewer = await loadViewer(auth)
    const courses = await loadCourses(viewer, { feedOwnerId: MASTER_USER_ID })
    return Response.json({ courses })
  } catch (error) {
    console.error('[courses] falhou', error)
    return fail(500, 'courses-failed', 'Não deu para carregar os cursos.')
  }
}
