// GET  /api/admin/enrollments?courseId=… — os inscritos de um curso
// POST /api/admin/enrollments            — conceder (por e-mail) e revogar à mão
//
// Quem abre é o criador ou o admin (`requireContentAdmin`), com a role relida do Postgres.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'
import { eq } from 'drizzle-orm'

import { getDb } from '~/database'
import { user } from '~/database/schema-private'
import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, readJson } from '~/server/api/respond'
import {
  grantEnrollment,
  loadEnrollments,
  revokeEnrollment,
} from '~/server/content/enrollments'

import type { Endpoint } from 'one'

const str = (value: unknown) => (typeof value === 'string' ? value : '')

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const courseId = new URL(request.url).searchParams.get('courseId') || ''
  if (!courseId) return FAIL.missingFields('Falta o curso.')

  try {
    const viewer = await loadViewer(auth)
    const enrollments = await loadEnrollments(viewer, courseId)
    if (!enrollments) return FAIL.forbidden('Só o criador vê os inscritos.')
    return Response.json({ enrollments })
  } catch (error) {
    console.error('[admin/enrollments] listagem falhou', error)
    return fail(500, 'admin-enrollments-failed', 'Não deu para carregar os inscritos.')
  }
}

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const p = await readJson<Record<string, unknown>>(request)
  if (!p) return FAIL.invalidJson()

  try {
    const viewer = await loadViewer(auth)

    switch (p.action) {
      case 'grant': {
        const email = str(p.email).trim().toLowerCase()
        if (!email) return FAIL.missingFields('Informe o e-mail da pessoa.')

        const [target] = await getDb()
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, email))
          .limit(1)
        if (!target) return fail(404, 'user-not-found', 'Nenhuma conta com esse e-mail.')

        const result = await grantEnrollment(viewer, {
          courseId: str(p.courseId),
          userId: target.id,
        })
        return result.ok
          ? Response.json({ ok: true, enrollmentId: result.enrollmentId })
          : fail(result.status, result.code, result.message)
      }

      case 'revoke': {
        const result = await revokeEnrollment(viewer, { enrollmentId: str(p.enrollmentId) })
        return result.ok
          ? Response.json({ ok: true, enrollmentId: result.enrollmentId })
          : fail(result.status, result.code, result.message)
      }

      default:
        return FAIL.unknownAction()
    }
  } catch (error) {
    console.error('[admin/enrollments] escrita falhou', error)
    return fail(500, 'admin-enrollments-failed', 'Não deu para salvar.')
  }
}
