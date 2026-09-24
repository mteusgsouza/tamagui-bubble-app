// O editor de cursos: curso, módulos e aulas.
//
// A ordem de módulo e aula passa a ser calculada no **servidor** (`max + 1`). A tela
// mandava `modules.length` e `totalLessons`, o que corria: dois cliques rápidos geravam
// a mesma posição.

import { and, eq, sql } from 'drizzle-orm'

import { getDb } from '~/database'
import { course, courseModule, lesson } from '~/database/schema-public'
import { loadCourses } from '~/server/content/courses'
import { requireContentAdmin } from '~/server/access/viewer'
import { isUniqueViolation } from '~/server/api/pgError'
import { nowIso } from '~/server/api/serialize'

import type { CourseDTO } from './dto'
import type { Visibility } from '~/data/enums'
import type { WriteResult } from './interactions'
import type { Viewer } from '~/server/access/viewer'

const forbidden = () =>
  ({
    ok: false as const,
    status: 403,
    code: 'forbidden',
    message: 'Só o criador administra o conteúdo.',
  })

const notFound = (message = 'Não encontrado.') =>
  ({ ok: false as const, status: 404, code: 'not-found', message })

/** O catálogo do editor: inclui curso e aula despublicados. */
export async function loadAdminCourses(
  viewer: Viewer,
  options: { feedOwnerId: string },
): Promise<CourseDTO[] | null> {
  if (!requireContentAdmin(viewer)) return null
  return loadCourses(viewer, { feedOwnerId: options.feedOwnerId, onlyPublished: false })
}

export async function loadAdminCourse(
  viewer: Viewer,
  options: { feedOwnerId: string; courseId: string },
): Promise<CourseDTO | null | 'forbidden'> {
  if (!requireContentAdmin(viewer)) return 'forbidden'
  const all = await loadCourses(viewer, {
    feedOwnerId: options.feedOwnerId,
    onlyPublished: false,
  })
  return all.find((item) => item.id === options.courseId) ?? null
}

export type SaveCourseArgs = {
  id: string
  feedOwnerId: string
  slug: string
  title: string
  description?: string | null
  visibility: Visibility
  requiredPlanId?: string | null
  coverMediaId?: string | null
}

export async function saveCourse(
  viewer: Viewer,
  args: SaveCourseArgs,
): Promise<WriteResult<{ courseId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const slug = args.slug.trim()
  if (!slug) {
    return { ok: false, status: 400, code: 'missing-slug', message: 'O curso precisa de um slug.' }
  }

  const requiredPlanId =
    args.visibility === 'subscribers' ? (args.requiredPlanId ?? null) : null

  const db = getDb()
  try {
    await db
      .insert(course)
      .values({
        id: args.id,
        feedOwnerId: args.feedOwnerId,
        slug,
        title: args.title,
        description: args.description ?? null,
        coverMediaId: args.coverMediaId ?? null,
        visibility: args.visibility,
        requiredPlanId,
        published: false,
        order: sql`(select coalesce(max("order"), -1) + 1 from "course" where "feedOwnerId" = ${args.feedOwnerId})`,
        createdAt: nowIso(),
      })
      .onConflictDoUpdate({
        target: course.id,
        // `published` e `order` são estado, não formulário
        set: {
          slug,
          title: args.title,
          description: args.description ?? null,
          coverMediaId: args.coverMediaId ?? null,
          visibility: args.visibility,
          requiredPlanId,
        },
      })
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        status: 422,
        code: 'slug-duplicado',
        message: 'Já existe um curso com esse endereço.',
      }
    }
    throw error
  }

  return { ok: true, courseId: args.id }
}

export async function setCoursePublished(
  viewer: Viewer,
  args: { courseId: string; published: boolean },
): Promise<WriteResult<{ courseId: string; published: boolean }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  const [row] = await db
    .update(course)
    .set({ published: args.published })
    .where(eq(course.id, args.courseId))
    .returning({ id: course.id })

  if (!row) return notFound('Curso não encontrado.')
  return { ok: true, courseId: args.courseId, published: args.published }
}

// ---------------------------------------------------------------------------
// Módulos
// ---------------------------------------------------------------------------

export async function addModule(
  viewer: Viewer,
  args: { courseId: string; title: string },
): Promise<WriteResult<{ moduleId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(courseModule).values({
    id,
    courseId: args.courseId,
    title: args.title,
    order: sql`(select coalesce(max("order"), -1) + 1 from "courseModule" where "courseId" = ${args.courseId})`,
  })
  return { ok: true, moduleId: id }
}

/** Remove o módulo. As aulas dele caem em "fora de módulo" (FK `set null`). */
export async function removeModule(
  viewer: Viewer,
  args: { moduleId: string },
): Promise<WriteResult<{ moduleId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  await db.delete(courseModule).where(eq(courseModule.id, args.moduleId))
  return { ok: true, moduleId: args.moduleId }
}

// ---------------------------------------------------------------------------
// Aulas
// ---------------------------------------------------------------------------

export async function addLesson(
  viewer: Viewer,
  args: { courseId: string; moduleId?: string | null; title: string },
): Promise<WriteResult<{ lessonId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  const id = crypto.randomUUID()
  await db.insert(lesson).values({
    id,
    courseId: args.courseId,
    moduleId: args.moduleId ?? null,
    title: args.title,
    published: false,
    freePreview: false,
    // ordem global no curso, como a tela fazia com `totalLessons`
    order: sql`(select coalesce(max("order"), -1) + 1 from "lesson" where "courseId" = ${args.courseId})`,
    createdAt: nowIso(),
  })
  return { ok: true, lessonId: id }
}

export type UpdateLessonArgs = {
  lessonId: string
  title?: string
  body?: string | null
  mediaId?: string | null
  durationSec?: number | null
  moduleId?: string | null
  published?: boolean
  freePreview?: boolean
}

export async function updateLesson(
  viewer: Viewer,
  args: UpdateLessonArgs,
): Promise<WriteResult<{ lessonId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  // só o que veio no corpo é escrito — o editor manda um campo por vez nos toggles
  const patch: Record<string, unknown> = {}
  if (args.title !== undefined) patch.title = args.title
  if (args.body !== undefined) patch.body = args.body
  if (args.mediaId !== undefined) patch.mediaId = args.mediaId
  if (args.durationSec !== undefined) patch.durationSec = args.durationSec
  if (args.moduleId !== undefined) patch.moduleId = args.moduleId
  if (args.published !== undefined) patch.published = args.published
  if (args.freePreview !== undefined) patch.freePreview = args.freePreview

  if (!Object.keys(patch).length) {
    return { ok: false, status: 400, code: 'nothing-to-update', message: 'Nada para salvar.' }
  }

  const db = getDb()
  const [row] = await db
    .update(lesson)
    .set(patch)
    .where(eq(lesson.id, args.lessonId))
    .returning({ id: lesson.id })

  if (!row) return notFound('Aula não encontrada.')
  return { ok: true, lessonId: args.lessonId }
}

export async function removeLesson(
  viewer: Viewer,
  args: { lessonId: string },
): Promise<WriteResult<{ lessonId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  await db.delete(lesson).where(eq(lesson.id, args.lessonId))
  return { ok: true, lessonId: args.lessonId }
}

/** Usado pelo editor para não deixar módulo órfão em curso de outro criador. */
export async function moduleBelongsTo(courseId: string, moduleId: string) {
  const db = getDb()
  const [row] = await db
    .select({ id: courseModule.id })
    .from(courseModule)
    .where(and(eq(courseModule.id, moduleId), eq(courseModule.courseId, courseId)))
    .limit(1)
  return Boolean(row)
}
