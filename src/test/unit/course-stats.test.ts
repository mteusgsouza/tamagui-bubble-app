import { describe, expect, test } from 'vitest'

import {
  courseStats,
  courseSummaryLine,
  formatLongDuration,
  lessonAfter,
  lessonPosition,
  moduleSummaryLine,
  nextLesson,
  resumeAt,
} from '~/features/courses/courseStats'

import type { Course, CourseLesson } from '~/features/courses/types'

// O Zero não expõe agregação: toda contagem de curso sai das linhas sincronizadas.
// É por isso que estas funções existem — e por isso vale testá-las.

const lesson = (
  id: string,
  extra: Partial<CourseLesson> = {},
): CourseLesson => ({
  id,
  courseId: 'c1',
  title: `Aula ${id}`,
  order: Number(id),
  durationSec: 600,
  ...extra,
})

const done = (id: string, extra: Partial<CourseLesson> = {}) =>
  lesson(id, {
    progress: [{ id: `p${id}`, positionSec: 600, completedAt: 1_700_000_000_000 }],
    ...extra,
  })

const started = (id: string, positionSec: number) =>
  lesson(id, { progress: [{ id: `p${id}`, positionSec }] })

const course = (lessons: CourseLesson[], extra: Partial<Course> = {}): Course => ({
  id: 'c1',
  feedOwnerId: 'u1',
  slug: 'curso',
  title: 'Curso',
  visibility: 'subscribers',
  order: 0,
  lessons,
  ...extra,
})

describe('courseStats', () => {
  test('curso vazio não divide por zero', () => {
    const stats = courseStats(course([]))
    expect(stats.lessonCount).toBe(0)
    expect(stats.ratio).toBe(0)
    expect(stats.totalDurationSec).toBe(0)
  })

  test('conta aulas, concluídas e duração total', () => {
    const stats = courseStats(course([done('1'), lesson('2'), lesson('3')]))
    expect(stats.lessonCount).toBe(3)
    expect(stats.completedCount).toBe(1)
    expect(stats.ratio).toBeCloseTo(1 / 3)
    expect(stats.totalDurationSec).toBe(1800)
  })

  test('aula começada mas não concluída NÃO conta como concluída', () => {
    // é a diferença entre `positionSec` e `completedAt`: só o segundo conclui
    const stats = courseStats(course([started('1', 590), lesson('2')]))
    expect(stats.completedCount).toBe(0)
  })

  test('aula sem duração não quebra o total', () => {
    const stats = courseStats(course([lesson('1', { durationSec: null }), lesson('2')]))
    expect(stats.totalDurationSec).toBe(600)
  })

  test('detecta aula de amostra', () => {
    expect(courseStats(course([lesson('1')])).hasFreePreview).toBe(false)
    expect(
      courseStats(course([lesson('1', { freePreview: true })])).hasFreePreview,
    ).toBe(true)
  })

  test('conta módulos', () => {
    const stats = courseStats(
      course([lesson('1')], {
        modules: [
          { id: 'm1', title: 'A', order: 0 },
          { id: 'm2', title: 'B', order: 1 },
        ],
      }),
    )
    expect(stats.moduleCount).toBe(2)
  })
})

describe('nextLesson', () => {
  test('a primeira NÃO concluída, na ordem do currículo', () => {
    // de propósito não é a mexida por último: quem largou a 2 e espiou a 4 volta pra 2
    const result = nextLesson(course([done('1'), started('2', 120), done('3')]))
    expect(result?.id).toBe('2')
  })

  test('curso todo concluído não tem próxima', () => {
    expect(nextLesson(course([done('1'), done('2')]))).toBeUndefined()
  })

  test('curso não começado aponta para a primeira', () => {
    expect(nextLesson(course([lesson('1'), lesson('2')]))?.id).toBe('1')
  })
})

describe('lessonPosition e lessonAfter', () => {
  const c = course([lesson('1'), lesson('2'), lesson('3')])

  test('posição é 1-based, como o "AULA 3 DE 24" da tela', () => {
    expect(lessonPosition(c, '2')).toEqual({ index: 2, total: 3 })
  })

  test('aula fora do curso devolve índice 0', () => {
    expect(lessonPosition(c, 'x')).toEqual({ index: 0, total: 3 })
  })

  test('a última aula não tem próxima', () => {
    expect(lessonAfter(c, '2')?.id).toBe('3')
    expect(lessonAfter(c, '3')).toBeUndefined()
  })
})

describe('resumeAt', () => {
  test('aula nunca aberta começa do zero', () => {
    expect(resumeAt(lesson('1'))).toBe(0)
  })

  test('aula começada retoma na posição', () => {
    expect(resumeAt(started('1', 252))).toBe(252)
  })

  test('aula concluída volta do começo, não do fim', () => {
    // senão reabrir uma aula vista mostraria os créditos
    expect(resumeAt(done('1'))).toBe(0)
  })
})

describe('formatLongDuration', () => {
  test('zero e nulo não viram rótulo', () => {
    expect(formatLongDuration(0)).toBeNull()
    expect(formatLongDuration(-5)).toBeNull()
  })

  test('menos de uma hora fica em minutos', () => {
    expect(formatLongDuration(48 * 60)).toBe('48 min')
  })

  test('hora cheia não mostra "00 min"', () => {
    expect(formatLongDuration(3600)).toBe('1 h')
  })

  test('horas e minutos, com minuto zero à esquerda', () => {
    expect(formatLongDuration(4 * 3600 + 12 * 60)).toBe('4 h 12 min')
    expect(formatLongDuration(3600 + 2 * 60)).toBe('1 h 02 min')
  })
})

describe('linhas de resumo', () => {
  test('curso completo: módulos, aulas e duração', () => {
    const stats = courseStats(
      course(
        [lesson('1', { durationSec: 1800 }), lesson('2', { durationSec: 1080 })],
        { modules: [{ id: 'm1', title: 'A', order: 0 }] },
      ),
    )
    expect(courseSummaryLine(stats)).toBe('1 módulo · 2 aulas · 48 min')
  })

  test('curso sem módulo e sem duração some com as partes vazias', () => {
    const stats = courseStats(course([lesson('1', { durationSec: null })]))
    expect(courseSummaryLine(stats)).toBe('1 aula')
  })

  test('linha do módulo', () => {
    expect(moduleSummaryLine([lesson('1'), lesson('2')])).toBe('2 aulas · 20 min')
  })
})
