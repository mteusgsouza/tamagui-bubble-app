import { zql } from 'on-zero'

import {
  canAccessCourse,
  canAccessLesson,
  canAccessOwnProgress,
} from '~/data/where/canAccessContent'

/**
 * Lista de cursos.
 *
 * Traz as aulas junto de propósito: a tela de lista mostra "24 aulas" e a barra de
 * progresso, e o Zero não expõe agregação — a contagem sai das linhas sincronizadas.
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
