import { zql } from 'on-zero'

import {
  canAccessCourse,
  canAccessLesson,
  canAccessOwnProgress,
} from '~/data/where/canAccessContent'

/**
 * Lista de cursos.
 *
 * Traz aulas e módulos junto de propósito: a tela de lista mostra
 * "6 módulos · 24 aulas · 4 h 12 min" e a barra de progresso, e o Zero não expõe
 * agregação — toda contagem sai das linhas sincronizadas. Módulo é linha pequena e são
 * poucos por curso; sem eles o resumo do card sai sem a parte de módulos.
 * Efeito colateral bom: ao abrir um curso, o detalhe já está no cache.
 */
export const courses = (props: { feedOwnerId: string; userId: string }) => {
  return zql.course
    .where(canAccessCourse)
    .where('feedOwnerId', props.feedOwnerId)
    .where('published', true)
    .orderBy('order', 'asc')
    .related('coverMedia', (q) => q.one())
    .related('requiredPlan', (q) => q.one())
    .related('modules', (q) => q.orderBy('order', 'asc'))
    .related('lessons', (q) =>
      q
        .where('published', true)
        .orderBy('order', 'asc')
        .related('progress', (p) => p.where('userId', props.userId)),
    )
}

/** Curso aberto: módulos e aulas em ordem, com o progresso do usuário em cada aula. */
export const courseDetail = (props: { courseId: string; userId: string }) => {
  return (
    zql.course
      .where(canAccessCourse)
      .where('id', props.courseId)
      .one()
      .related('coverMedia', (q) => q.one())
      .related('requiredPlan', (q) => q.one())
      .related('modules', (q) =>
        q.orderBy('order', 'asc').related('lessons', (l) =>
          l
            .where('published', true)
            .orderBy('order', 'asc')
            .related('progress', (p) => p.where('userId', props.userId)),
        ),
      )
      // aulas soltas (moduleId null) não aparecem via `modules` — por isso a lista cheia
      .related('lessons', (q) =>
        q
          .where('published', true)
          .orderBy('order', 'asc')
          .related('media', (m) => m.one())
          .related('progress', (p) => p.where('userId', props.userId)),
      )
  )
}

/**
 * Mesmo conteúdo do `courseDetail`, buscado por slug — é o que a rota
 * `/home/courses/[courseSlug]` recebe. O índice único é `(feedOwnerId, slug)`, por isso
 * o dono do feed entra na chave.
 */
export const courseBySlug = (props: {
  feedOwnerId: string
  slug: string
  userId: string
}) => {
  return zql.course
    .where(canAccessCourse)
    .where('feedOwnerId', props.feedOwnerId)
    .where('slug', props.slug)
    .one()
    .related('coverMedia', (q) => q.one())
    .related('requiredPlan', (q) => q.one())
    .related('modules', (q) => q.orderBy('order', 'asc'))
    .related('lessons', (q) =>
      q
        .where('published', true)
        .orderBy('order', 'asc')
        .related('media', (m) => m.one())
        .related('progress', (p) => p.where('userId', props.userId)),
    )
}

/** Player. `canAccessLesson` deixa passar `freePreview` mesmo em curso fechado. */
export const lessonDetail = (props: { lessonId: string; userId: string }) => {
  return zql.lesson
    .where(canAccessLesson)
    .where('id', props.lessonId)
    .one()
    .related('media', (q) => q.one())
    .related('module', (q) => q.one())
    .related('course', (q) => q.one())
    .related('progress', (q) => q.where('userId', props.userId))
}

/** Continuar de onde parou: a aula mexida mais recentemente e ainda não concluída. */
export const lessonsInProgress = (props: { userId: string; limit?: number }) => {
  return zql.lessonProgress
    .where(canAccessOwnProgress)
    .where('userId', props.userId)
    .where('completedAt', 'IS', null)
    .orderBy('updatedAt', 'desc')
    .limit(props.limit ?? 5)
    .related('lesson', (q) => q.one().related('course', (c) => c.one()))
}
