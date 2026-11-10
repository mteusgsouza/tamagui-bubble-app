import { describe, expect, test } from 'vitest'

import { isCourseComplete, minLessonsUnreachable } from '~/features/courses/completion'

const all = { completionRule: 'all', minLessons: null } as const
const min = (minLessons: number | null) =>
  ({ completionRule: 'min-lessons', minLessons }) as const

describe('isCourseComplete', () => {
  test('all: conclui só com todas', () => {
    expect(isCourseComplete(all, { completedCount: 5, lessonCount: 5 })).toBe(true)
    expect(isCourseComplete(all, { completedCount: 4, lessonCount: 5 })).toBe(false)
  })

  test('curso sem aula não conclui (0 de 0 não é 100%)', () => {
    expect(isCourseComplete(all, { completedCount: 0, lessonCount: 0 })).toBe(false)
    expect(isCourseComplete(min(1), { completedCount: 0, lessonCount: 0 })).toBe(false)
  })

  test('min-lessons: conclui ao atingir o mínimo', () => {
    expect(isCourseComplete(min(2), { completedCount: 1, lessonCount: 5 })).toBe(false)
    expect(isCourseComplete(min(2), { completedCount: 2, lessonCount: 5 })).toBe(true)
    expect(isCourseComplete(min(2), { completedCount: 5, lessonCount: 5 })).toBe(true)
  })

  test('minLessons maior que o total nunca conclui', () => {
    expect(isCourseComplete(min(99), { completedCount: 5, lessonCount: 5 })).toBe(false)
  })

  test('min-lessons sem número trata como all', () => {
    expect(isCourseComplete(min(null), { completedCount: 4, lessonCount: 5 })).toBe(false)
    expect(isCourseComplete(min(null), { completedCount: 5, lessonCount: 5 })).toBe(true)
  })

  test('min-lessons zero ou negativo não libera de graça', () => {
    expect(isCourseComplete(min(0), { completedCount: 0, lessonCount: 5 })).toBe(false)
    expect(isCourseComplete(min(-3), { completedCount: 0, lessonCount: 5 })).toBe(false)
  })
})

describe('minLessonsUnreachable', () => {
  test('avisa só quando o mínimo passa do total', () => {
    expect(minLessonsUnreachable(min(99), 5)).toBe(true)
    expect(minLessonsUnreachable(min(5), 5)).toBe(false)
    expect(minLessonsUnreachable(all, 5)).toBe(false)
    expect(minLessonsUnreachable(min(null), 5)).toBe(false)
  })
})
