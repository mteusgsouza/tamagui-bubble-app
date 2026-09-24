// GET  /api/admin/courses — o catálogo do editor, com curso e aula despublicados
// POST /api/admin/courses — curso, módulos e aulas

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { MASTER_USER_ID } from '~/constants/creator'
import { isVisibility } from '~/data/enums'
import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, readJson } from '~/server/api/respond'
import {
  addLesson,
  addModule,
  loadAdminCourses,
  removeLesson,
  removeModule,
  saveCourse,
  setCoursePublished,
  updateLesson,
} from '~/server/content/adminCourses'

import type { Endpoint } from 'one'

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()
  if (!MASTER_USER_ID) return fail(503, 'no-creator', 'O catálogo não tem dono configurado.')

  try {
    const viewer = await loadViewer(auth)
    const courses = await loadAdminCourses(viewer, { feedOwnerId: MASTER_USER_ID })
    if (!courses) return FAIL.forbidden('Só o criador vê o editor.')
    return Response.json({ courses })
  } catch (error) {
    console.error('[admin/courses] listagem falhou', error)
    return fail(500, 'admin-courses-failed', 'Não deu para carregar os cursos.')
  }
}

type Body = Record<string, unknown>

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const orNull = (value: unknown) => (typeof value === 'string' && value ? value : null)
const bool = (value: unknown) => (typeof value === 'boolean' ? value : undefined)

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()
  if (!MASTER_USER_ID) return fail(503, 'no-creator', 'O catálogo não tem dono configurado.')

  const p = await readJson<Body>(request)
  if (!p) return FAIL.invalidJson()

  try {
    const viewer = await loadViewer(auth)

    switch (p.action) {
      case 'saveCourse': {
        if (p.visibility !== undefined && !isVisibility(p.visibility)) {
          return fail(422, 'invalid-visibility', 'Visibilidade desconhecida.')
        }
        const result = await saveCourse(viewer, {
          id: str(p.id),
          feedOwnerId: MASTER_USER_ID,
          slug: str(p.slug),
          title: str(p.title),
          description: orNull(p.description),
          visibility: isVisibility(p.visibility) ? p.visibility : 'subscribers',
          requiredPlanId: orNull(p.requiredPlanId),
          coverMediaId: orNull(p.coverMediaId),
        })
        return result.ok
          ? Response.json({ ok: true, courseId: result.courseId })
          : fail(result.status, result.code, result.message)
      }

      case 'togglePublish': {
        const result = await setCoursePublished(viewer, {
          courseId: str(p.id),
          published: p.published === true,
        })
        return result.ok
          ? Response.json({ ok: true, courseId: result.courseId, published: result.published })
          : fail(result.status, result.code, result.message)
      }

      case 'addModule': {
        const result = await addModule(viewer, {
          courseId: str(p.courseId),
          title: str(p.title) || 'Novo módulo',
        })
        return result.ok
          ? Response.json({ ok: true, moduleId: result.moduleId })
          : fail(result.status, result.code, result.message)
      }

      case 'removeModule': {
        const result = await removeModule(viewer, { moduleId: str(p.moduleId) })
        return result.ok
          ? Response.json({ ok: true, moduleId: result.moduleId })
          : fail(result.status, result.code, result.message)
      }

      case 'addLesson': {
        const result = await addLesson(viewer, {
          courseId: str(p.courseId),
          moduleId: orNull(p.moduleId),
          title: str(p.title) || 'Nova aula',
        })
        return result.ok
          ? Response.json({ ok: true, lessonId: result.lessonId })
          : fail(result.status, result.code, result.message)
      }

      case 'updateLesson': {
        const result = await updateLesson(viewer, {
          lessonId: str(p.lessonId),
          title: typeof p.title === 'string' ? p.title : undefined,
          body: p.body === undefined ? undefined : orNull(p.body),
          mediaId: p.mediaId === undefined ? undefined : orNull(p.mediaId),
          durationSec:
            p.durationSec === undefined ? undefined : (Number(p.durationSec) || null),
          moduleId: p.moduleId === undefined ? undefined : orNull(p.moduleId),
          published: bool(p.published),
          freePreview: bool(p.freePreview),
        })
        return result.ok
          ? Response.json({ ok: true, lessonId: result.lessonId })
          : fail(result.status, result.code, result.message)
      }

      case 'removeLesson': {
        const result = await removeLesson(viewer, { lessonId: str(p.lessonId) })
        return result.ok
          ? Response.json({ ok: true, lessonId: result.lessonId })
          : fail(result.status, result.code, result.message)
      }

      default:
        return FAIL.unknownAction()
    }
  } catch (error) {
    console.error('[admin/courses] escrita falhou', error)
    return fail(500, 'admin-courses-failed', 'Não deu para salvar.')
  }
}
