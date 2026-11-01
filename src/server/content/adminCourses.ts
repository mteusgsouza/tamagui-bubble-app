// O editor de cursos: curso, módulos e aulas.
//
// A ordem de módulo e aula passa a ser calculada no **servidor** (`max + 1`). A tela
// mandava `modules.length` e `totalLessons`, o que corria: dois cliques rápidos geravam
// a mesma posição.

import { and, eq, inArray, sql } from 'drizzle-orm'

import { getDb } from '~/database'
import { course, courseModule, lesson } from '~/database/schema-public'
import { sequenceLessons } from '~/features/admin/lessonOrder'
import { loadCourses } from '~/server/content/courses'
import { requireContentAdmin } from '~/server/access/viewer'
import { isUniqueViolation } from '~/server/api/pgError'
import { nowIso } from '~/server/api/serialize'

import type { CourseDTO } from './dto'
import type { SubscriberAccess } from '~/server/access/contentAccess'
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
  /** `undefined` deixa como está (o formulário antigo não manda) */
  subscriberAccess?: SubscriberAccess
  /** `undefined` deixa a capa como está — o formulário não a carrega */
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
        ...(args.subscriberAccess && { subscriberAccess: args.subscriberAccess }),
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
          visibility: args.visibility,
          requiredPlanId,
          ...(args.subscriberAccess && { subscriberAccess: args.subscriberAccess }),
          ...(args.coverMediaId !== undefined && { coverMediaId: args.coverMediaId }),
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
    .set(
      // republicar não reescreve a data original — é com ela que `since-subscription` decide
      args.published
        ? { published: true, publishedAt: sql`coalesce(${course.publishedAt}, now())` }
        : { published: false },
    )
    .where(eq(course.id, args.courseId))
    .returning({ id: course.id })

  if (!row) return notFound('Curso não encontrado.')
  return { ok: true, courseId: args.courseId, published: args.published }
}

/**
 * Troca a capa na hora, sem passar pelo formulário.
 *
 * Não apaga a `media` antiga: ela pode estar em outro lugar, e apagar bytes do R2 não é
 * desta operação (mesma regra de `detachMedia` no post).
 */
export async function setCourseCover(
  viewer: Viewer,
  args: { courseId: string; mediaId: string | null },
): Promise<WriteResult<{ courseId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  const [row] = await db
    .update(course)
    .set({ coverMediaId: args.mediaId })
    .where(eq(course.id, args.courseId))
    .returning({ id: course.id })

  if (!row) return notFound('Curso não encontrado.')
  return { ok: true, courseId: args.courseId }
}

// ---------------------------------------------------------------------------
// Ordem
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0]

/** `CASE id WHEN … THEN <posição>`: reescreve a ordem inteira numa instrução só. */
const orderCase = (idColumn: typeof lesson.id | typeof courseModule.id, ids: string[]) =>
  sql`(case ${idColumn} ${sql.join(
    ids.map((id, index) => sql`when ${id} then ${index}`),
    sql` `,
  )} end)::int`

async function writeLessonOrder(tx: Tx, ids: string[]) {
  if (!ids.length) return
  await tx
    .update(lesson)
    .set({ order: orderCase(lesson.id, ids) })
    .where(inArray(lesson.id, ids))
}

/**
 * Refaz a numeração global das aulas seguindo os módulos. Chamada sempre que uma aula
 * muda de módulo ou um módulo muda de lugar — a tela agrupa por módulo, e o "próxima
 * aula" do player lê a numeração global; as duas têm que contar a mesma história.
 */
async function resequenceLessons(tx: Tx, courseId: string) {
  const [modules, lessons] = await Promise.all([
    tx
      .select({ id: courseModule.id, order: courseModule.order })
      .from(courseModule)
      .where(eq(courseModule.courseId, courseId)),
    tx
      .select({ id: lesson.id, moduleId: lesson.moduleId, order: lesson.order })
      .from(lesson)
      .where(eq(lesson.courseId, courseId)),
  ])
  await writeLessonOrder(tx, sequenceLessons(modules, lessons))
}

const staleOrder = () =>
  ({
    ok: false as const,
    status: 422,
    code: 'ordem-desatualizada',
    message: 'O currículo mudou enquanto você editava. Recarregue e tente de novo.',
  })

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && new Set(a).size === a.length && b.every((id) => a.includes(id))

/** Reescreve `lesson.order` com a lista de ids recebida — que tem de ser **toda** a lista. */
export async function reorderLessons(
  viewer: Viewer,
  args: { courseId: string; lessonIds: string[] },
): Promise<WriteResult<{ courseId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  return db.transaction(async (tx) => {
    const current = await tx
      .select({ id: lesson.id })
      .from(lesson)
      .where(eq(lesson.courseId, args.courseId))
    if (!sameSet(args.lessonIds, current.map((row) => row.id))) return staleOrder()

    await writeLessonOrder(tx, args.lessonIds)
    return { ok: true as const, courseId: args.courseId }
  })
}

/** Idem para módulos; as aulas acompanham (ver `resequenceLessons`). */
export async function reorderModules(
  viewer: Viewer,
  args: { courseId: string; moduleIds: string[] },
): Promise<WriteResult<{ courseId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  return db.transaction(async (tx) => {
    const current = await tx
      .select({ id: courseModule.id })
      .from(courseModule)
      .where(eq(courseModule.courseId, args.courseId))
    if (!sameSet(args.moduleIds, current.map((row) => row.id))) return staleOrder()

    if (args.moduleIds.length) {
      await tx
        .update(courseModule)
        .set({ order: orderCase(courseModule.id, args.moduleIds) })
        .where(inArray(courseModule.id, args.moduleIds))
    }
    await resequenceLessons(tx, args.courseId)
    return { ok: true as const, courseId: args.courseId }
  })
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

export async function updateModule(
  viewer: Viewer,
  args: { moduleId: string; title: string },
): Promise<WriteResult<{ moduleId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const title = args.title.trim()
  if (!title) {
    return { ok: false, status: 400, code: 'missing-title', message: 'O módulo precisa de um nome.' }
  }

  const db = getDb()
  const [row] = await db
    .update(courseModule)
    .set({ title })
    .where(eq(courseModule.id, args.moduleId))
    .returning({ id: courseModule.id })

  if (!row) return notFound('Módulo não encontrado.')
  return { ok: true, moduleId: args.moduleId }
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
  moduleId?: string | null
  published?: boolean
  freePreview?: boolean
}

export async function updateLesson(
  viewer: Viewer,
  args: UpdateLessonArgs,
): Promise<WriteResult<{ lessonId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  // só o que veio no corpo é escrito — o editor manda um campo por vez nos toggles.
  // `durationSec` não entra: a duração sai da mídia (`media.durationSec`), e a coluna
  // `lesson.durationSec` ficou como resíduo do seed.
  const patch: Record<string, unknown> = {}
  if (args.title !== undefined) patch.title = args.title
  if (args.body !== undefined) patch.body = args.body
  if (args.mediaId !== undefined) patch.mediaId = args.mediaId
  if (args.moduleId !== undefined) patch.moduleId = args.moduleId
  if (args.published !== undefined) patch.published = args.published
  if (args.freePreview !== undefined) patch.freePreview = args.freePreview

  if (!Object.keys(patch).length) {
    return { ok: false, status: 400, code: 'nothing-to-update', message: 'Nada para salvar.' }
  }

  const db = getDb()
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ courseId: lesson.courseId, moduleId: lesson.moduleId })
      .from(lesson)
      .where(eq(lesson.id, args.lessonId))
      .limit(1)
    if (!current) return notFound('Aula não encontrada.')

    const moving = args.moduleId !== undefined && args.moduleId !== current.moduleId
    if (moving) {
      if (args.moduleId) {
        const [target] = await tx
          .select({ id: courseModule.id })
          .from(courseModule)
          .where(
            and(
              eq(courseModule.id, args.moduleId),
              eq(courseModule.courseId, current.courseId),
            ),
          )
          .limit(1)
        if (!target) {
          return {
            ok: false as const,
            status: 422,
            code: 'invalid-module',
            message: 'Esse módulo não é deste curso.',
          }
        }
      }
      // chega no fim do módulo de destino: a numeração é refeita logo abaixo
      patch.order = sql`(select coalesce(max("order"), -1) + 1 from "lesson" where "courseId" = ${current.courseId})`
    }

    await tx.update(lesson).set(patch).where(eq(lesson.id, args.lessonId))
    if (moving) await resequenceLessons(tx, current.courseId)

    return { ok: true as const, lessonId: args.lessonId }
  })
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
