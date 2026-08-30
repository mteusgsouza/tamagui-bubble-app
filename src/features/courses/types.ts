// Formas que a UI de cursos consome. Estruturais, como as do feed
// (`~/features/feed/types`), para o mesmo componente aceitar o resultado de `courses`
// e de `courseDetail`, que trazem campos diferentes.

import type { MediaViewMedia } from '~/features/media/MediaFrame'

/** `progress` chega como array porque a query filtra por `userId` — 0 ou 1 linha. */
export type LessonProgressRow = {
  id: string
  positionSec: number
  completedAt?: number | null
  updatedAt?: number
}

export type CourseLesson = {
  id: string
  courseId: string
  moduleId?: string | null
  title: string
  body?: string | null
  durationSec?: number | null
  order: number
  published?: boolean
  freePreview?: boolean
  media?: MediaViewMedia | null
  progress?: readonly LessonProgressRow[]
}

export type CourseModule = {
  id: string
  title: string
  order: number
  lessons?: readonly CourseLesson[]
}

export type CoursePlan = {
  id: string
  name: string
}

export type Course = {
  id: string
  feedOwnerId: string
  slug: string
  title: string
  description?: string | null
  visibility: string
  requiredPlanId?: string | null
  published?: boolean
  order: number
  coverMedia?: MediaViewMedia | null
  requiredPlan?: CoursePlan | null
  modules?: readonly CourseModule[]
  /** todas as aulas do curso, inclusive as soltas (sem `moduleId`) */
  lessons?: readonly CourseLesson[]
}

/** A linha de progresso do usuário nesta aula, ou `undefined`. */
export const lessonProgress = (lesson: CourseLesson) => lesson.progress?.[0]

export const isLessonComplete = (lesson: CourseLesson) =>
  Boolean(lessonProgress(lesson)?.completedAt)
