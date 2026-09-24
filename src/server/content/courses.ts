// Cursos, módulos e aulas — montados no servidor.
//
// Mesmo orçamento fixo do feed: 4 queries para a lista inteira, independente de quantos
// cursos, módulos e aulas existam.
//
// 🔓 **Curso bloqueado existe.** É o tratamento que o post recebeu na Fase 12, agora
// aplicado ao curso: capa, título, descrição e currículo (títulos, ordem, duração)
// chegam a todo mundo; `body` e `media` da aula só para quem tem direito, e a aula de
// amostra abre mesmo em curso fechado.
//
// Antes a linha inteira era filtrada, e quem não assinava via "Nenhum curso por aqui" —
// exatamente a mentira que a própria tela admitia num comentário. Catálogo invisível não
// converte ninguém.

import { and, asc, eq, inArray } from 'drizzle-orm'

import { getDb } from '~/database'
import {
  course,
  courseModule,
  lesson,
  lessonProgress,
  media,
  plan,
} from '~/database/schema-public'
import { courseAccess, lessonAccess } from '~/server/access/contentAccess'
import { toEpoch } from '~/server/api/serialize'

import type {
  CourseDTO,
  CourseModuleDTO,
  LessonDetailDTO,
  LessonDTO,
  LessonProgressDTO,
  MediaDTO,
} from './dto'
import type { Viewer } from '~/server/access/viewer'

type MediaColumns = {
  mediaId: string | null
  mediaKind: string | null
  mediaMime: string | null
  mediaPosterKey: string | null
  mediaDurationSec: number | null
  mediaWidth: number | null
  mediaHeight: number | null
}

const MEDIA_COLUMNS = {
  mediaId: media.id,
  mediaKind: media.kind,
  mediaMime: media.mime,
  mediaPosterKey: media.posterKey,
  mediaDurationSec: media.durationSec,
  mediaWidth: media.width,
  mediaHeight: media.height,
}

const toMedia = (row: MediaColumns): MediaDTO | null =>
  row.mediaId
    ? {
        id: row.mediaId,
        kind: row.mediaKind ?? '',
        mime: row.mediaMime,
        posterKey: row.mediaPosterKey,
        durationSec: row.mediaDurationSec,
        width: row.mediaWidth,
        height: row.mediaHeight,
      }
    : null

/** Progresso do visitante nas aulas dadas. Uma query, vira `Map`. */
async function loadProgress(lessonIds: string[], userId: string) {
  const byLesson = new Map<string, LessonProgressDTO[]>()
  if (!lessonIds.length || !userId) return byLesson

  const db = getDb()
  const rows = await db
    .select({
      id: lessonProgress.id,
      lessonId: lessonProgress.lessonId,
      positionSec: lessonProgress.positionSec,
      completedAt: lessonProgress.completedAt,
      updatedAt: lessonProgress.updatedAt,
    })
    .from(lessonProgress)
    .where(
      and(inArray(lessonProgress.lessonId, lessonIds), eq(lessonProgress.userId, userId)),
    )

  for (const row of rows) {
    byLesson.set(row.lessonId, [
      {
        id: row.id,
        positionSec: row.positionSec,
        completedAt: toEpoch(row.completedAt),
        updatedAt: toEpoch(row.updatedAt),
      },
    ])
  }
  return byLesson
}

type LessonRow = typeof lesson.$inferSelect

const toLesson = (
  row: LessonRow,
  mediaRow: MediaDTO | null,
  progress: LessonProgressDTO[],
): LessonDTO => ({
  id: row.id,
  courseId: row.courseId,
  moduleId: row.moduleId,
  title: row.title,
  body: row.body,
  durationSec: row.durationSec,
  order: row.order,
  published: row.published,
  freePreview: row.freePreview,
  media: mediaRow,
  progress,
})

/**
 * Os cursos visíveis para o visitante, com módulos, aulas e progresso.
 *
 * `onlyPublished: false` é o modo admin — traz rascunho, e o chamador é quem garante
 * que só dono e admin chegam aqui.
 */
export async function loadCourses(
  viewer: Viewer,
  options: { feedOwnerId: string; onlyPublished?: boolean },
): Promise<CourseDTO[]> {
  const db = getDb()
  const onlyPublished = options.onlyPublished !== false

  const courseRows = await db
    .select({
      course,
      planId: plan.id,
      planName: plan.name,
      ...MEDIA_COLUMNS,
    })
    .from(course)
    .leftJoin(media, eq(media.id, course.coverMediaId))
    .leftJoin(plan, eq(plan.id, course.requiredPlanId))
    .where(
      onlyPublished
        ? and(eq(course.feedOwnerId, options.feedOwnerId), eq(course.published, true))
        : eq(course.feedOwnerId, options.feedOwnerId),
    )
    .orderBy(asc(course.order))

  // o tier decide em memória, e agora decide o **conteúdo**, não a existência
  const access = new Map(
    courseRows.map((row) => [row.course.id, courseAccess(viewer, row.course)] as const),
  )

  const courseIds = courseRows.map((row) => row.course.id)
  if (!courseIds.length) return []

  const [moduleRows, lessonRows] = await Promise.all([
    db
      .select()
      .from(courseModule)
      .where(inArray(courseModule.courseId, courseIds))
      .orderBy(asc(courseModule.order)),
    db
      .select({ lesson, ...MEDIA_COLUMNS })
      .from(lesson)
      .leftJoin(media, eq(media.id, lesson.mediaId))
      .where(
        onlyPublished
          ? and(inArray(lesson.courseId, courseIds), eq(lesson.published, true))
          : inArray(lesson.courseId, courseIds),
      )
      .orderBy(asc(lesson.order)),
  ])

  const progress = await loadProgress(
    lessonRows.map((row) => row.lesson.id),
    viewer.id,
  )

  const lessonsByCourse = new Map<string, LessonDTO[]>()
  for (const row of lessonRows) {
    const allowed = access.get(row.lesson.courseId)?.allowed ?? true
    // a aula de amostra abre mesmo em curso fechado — é o gancho de conversão
    const open = allowed || row.lesson.freePreview

    const item = toLesson(
      row.lesson,
      open ? toMedia(row) : null,
      progress.get(row.lesson.id) ?? [],
    )
    // título, ordem e duração são vitrine; corpo e mídia são produto
    const list = lessonsByCourse.get(row.lesson.courseId) ?? []
    list.push(open ? item : { ...item, body: null })
    lessonsByCourse.set(row.lesson.courseId, list)
  }

  const modulesByCourse = new Map<string, CourseModuleDTO[]>()
  for (const row of moduleRows) {
    const list = modulesByCourse.get(row.courseId) ?? []
    list.push({
      id: row.id,
      title: row.title,
      order: row.order,
      lessons: (lessonsByCourse.get(row.courseId) ?? []).filter(
        (item) => item.moduleId === row.id,
      ),
    })
    modulesByCourse.set(row.courseId, list)
  }

  return courseRows.map((row) => ({
    id: row.course.id,
    feedOwnerId: row.course.feedOwnerId,
    slug: row.course.slug,
    title: row.course.title,
    description: row.course.description,
    visibility: row.course.visibility,
    requiredPlanId: row.course.requiredPlanId,
    published: row.course.published,
    order: row.course.order,
    coverMedia: toMedia(row),
    requiredPlan: row.planId ? { id: row.planId, name: row.planName ?? '' } : null,
    modules: modulesByCourse.get(row.course.id) ?? [],
    lessons: lessonsByCourse.get(row.course.id) ?? [],
    locked: !(access.get(row.course.id)?.allowed ?? true),
    lockReason: (() => {
      const result = access.get(row.course.id)
      return result && !result.allowed ? result.reason : null
    })(),
  }))
}

/** Um curso pelo slug. `null` só quando **não existe** — bloqueado vem, com `locked`. */
export async function loadCourseBySlug(
  viewer: Viewer,
  options: { feedOwnerId: string; slug: string },
): Promise<CourseDTO | null> {
  const all = await loadCourses(viewer, { feedOwnerId: options.feedOwnerId })
  return all.find((item) => item.slug === options.slug) ?? null
}

/**
 * Uma aula, com o contexto de módulo e curso.
 *
 * `null` quando não existe ou está fechada — a tela mostra "Aula indisponível" sem
 * distinguir os dois, igual ao que o Zero fazia.
 */
export async function loadLessonDetail(
  viewer: Viewer,
  lessonId: string,
): Promise<LessonDetailDTO | null> {
  const db = getDb()

  const [row] = await db
    .select({
      lesson,
      course,
      moduleId: courseModule.id,
      moduleTitle: courseModule.title,
      moduleOrder: courseModule.order,
      ...MEDIA_COLUMNS,
    })
    .from(lesson)
    .innerJoin(course, eq(course.id, lesson.courseId))
    .leftJoin(courseModule, eq(courseModule.id, lesson.moduleId))
    .leftJoin(media, eq(media.id, lesson.mediaId))
    .where(eq(lesson.id, lessonId))
    .limit(1)

  if (!row) return null
  if (!lessonAccess(viewer, row.lesson, row.course).allowed) return null

  const progress = await loadProgress([lessonId], viewer.id)

  return {
    ...toLesson(row.lesson, toMedia(row), progress.get(lessonId) ?? []),
    module: row.moduleId
      ? { id: row.moduleId, title: row.moduleTitle ?? '', order: row.moduleOrder ?? 0 }
      : null,
    course: { id: row.course.id, slug: row.course.slug, title: row.course.title },
  }
}
