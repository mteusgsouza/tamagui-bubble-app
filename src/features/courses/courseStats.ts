// Contas do curso: quantas aulas, quanto tempo, quanto já foi visto.
//
// Módulo puro, sem import de UI — o Zero não expõe agregação, então tudo isso sai das
// linhas que a query já sincronizou. É também o que torna essas regras testáveis.

import { isLessonComplete, lessonProgress } from './types'

import type { Course, CourseLesson } from './types'

/** Percentual a partir do qual a aula conta como concluída sozinha. */
export const COMPLETE_THRESHOLD = 0.95

export type CourseStats = {
  moduleCount: number
  lessonCount: number
  completedCount: number
  /** 0..1 */
  ratio: number
  totalDurationSec: number
  /** existe alguma aula de amostra, aberta a quem não assina */
  hasFreePreview: boolean
}

/**
 * As aulas do curso.
 *
 * `courseDetail` traz `lessons` (todas) **e** `modules[].lessons`. A lista cheia é a
 * fonte: aula solta, sem `moduleId`, não aparece pendurada em módulo nenhum.
 */
export const courseLessons = (course: Course): readonly CourseLesson[] =>
  course.lessons ?? []

export function courseStats(course: Course): CourseStats {
  const lessons = courseLessons(course)
  const completedCount = lessons.filter(isLessonComplete).length

  return {
    moduleCount: course.modules?.length ?? 0,
    lessonCount: lessons.length,
    completedCount,
    ratio: lessons.length > 0 ? completedCount / lessons.length : 0,
    totalDurationSec: lessons.reduce((sum, l) => sum + (l.durationSec ?? 0), 0),
    hasFreePreview: lessons.some((l) => l.freePreview),
  }
}

/**
 * "Continuar de onde parou": a primeira aula não concluída, na ordem do currículo.
 *
 * Não é a mexida mais recentemente de propósito — quem abandonou a aula 9 e depois
 * espiou a 20 quer voltar para a 9. `lessonsInProgress` (query) resolve o outro caso.
 */
export function nextLesson(course: Course): CourseLesson | undefined {
  const lessons = courseLessons(course)
  return lessons.find((lesson) => !isLessonComplete(lesson)) ?? undefined
}

/** Índice 1-based da aula dentro do curso — o "AULA 3 DE 24" da tela do player. */
export function lessonPosition(course: Course, lessonId: string) {
  const lessons = courseLessons(course)
  const index = lessons.findIndex((lesson) => lesson.id === lessonId)
  return { index: index + 1, total: lessons.length }
}

/** A aula seguinte no currículo, ou `undefined` na última. */
export function lessonAfter(course: Course, lessonId: string) {
  const lessons = courseLessons(course)
  const index = lessons.findIndex((lesson) => lesson.id === lessonId)
  return index >= 0 ? lessons[index + 1] : undefined
}

/** Onde retomar esta aula, em segundos. 0 quando nunca foi aberta ou já acabou. */
export function resumeAt(lesson: CourseLesson) {
  const progress = lessonProgress(lesson)
  if (!progress || progress.completedAt) return 0
  return progress.positionSec > 0 ? progress.positionSec : 0
}

// --- formatação ---

/** "4 h 12 min", "48 min", "1 h" — duração longa, para totais de curso e módulo. */
export function formatLongDuration(totalSec: number) {
  if (!totalSec || totalSec <= 0) return null

  const minutes = Math.round(totalSec / 60)
  if (minutes < 60) return `${minutes} min`

  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`

/** "6 módulos · 24 aulas · 4 h 12 min" — some as partes que não se aplicam. */
export function courseSummaryLine(stats: CourseStats) {
  const parts: string[] = []
  if (stats.moduleCount > 0) parts.push(plural(stats.moduleCount, 'módulo', 'módulos'))
  if (stats.lessonCount > 0) parts.push(plural(stats.lessonCount, 'aula', 'aulas'))

  const duration = formatLongDuration(stats.totalDurationSec)
  if (duration) parts.push(duration)

  return parts.join(' · ')
}

/** "4 aulas · 48 min" — a linha do módulo. */
export function moduleSummaryLine(lessons: readonly CourseLesson[]) {
  const parts = [plural(lessons.length, 'aula', 'aulas')]
  const duration = formatLongDuration(
    lessons.reduce((sum, l) => sum + (l.durationSec ?? 0), 0),
  )
  if (duration) parts.push(duration)
  return parts.join(' · ')
}
