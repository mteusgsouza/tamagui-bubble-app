// GET /api/admin/course/<id> — o curso para editar, com aula despublicada.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { MASTER_USER_ID } from '~/constants/creator'
import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, pathParam } from '~/server/api/respond'
import { loadAdminCourse } from '~/server/content/adminCourses'

import type { Endpoint } from 'one'

const ID_FROM_PATH = /\/api\/admin\/course\/([^/]+)\/?$/

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()
  if (!MASTER_USER_ID) return fail(503, 'no-creator', 'O catálogo não tem dono configurado.')

  const courseId = pathParam(request, ID_FROM_PATH)
  if (!courseId) return fail(400, 'invalid-id', 'Curso inválido.')

  try {
    const viewer = await loadViewer(auth)
    const course = await loadAdminCourse(viewer, { feedOwnerId: MASTER_USER_ID, courseId })
    if (course === 'forbidden') return FAIL.forbidden('Só o criador vê o editor.')
    if (!course) return FAIL.notFound('Curso não encontrado.')
    return Response.json({ course })
  } catch (error) {
    console.error('[admin/course] falhou', error)
    return fail(500, 'admin-course-failed', 'Não deu para carregar o curso.')
  }
}
