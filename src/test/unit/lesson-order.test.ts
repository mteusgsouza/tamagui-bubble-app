import { describe, expect, test } from 'vitest'

import { moveLesson, moveModule, sequenceLessons } from '~/features/admin/lessonOrder'

const l = (id: string, order: number, moduleId: string | null) => ({ id, order, moduleId })

// m1: a b · m2: c d · soltas: e
const lessons = [
  l('a', 0, 'm1'),
  l('b', 1, 'm1'),
  l('c', 2, 'm2'),
  l('d', 3, 'm2'),
  l('e', 4, null),
]

describe('moveLesson — setas dentro do módulo', () => {
  test('sobe trocando com a vizinha', () => {
    expect(moveLesson(lessons, 'b', 'up')).toEqual(['b', 'a', 'c', 'd', 'e'])
  })

  test('desce trocando com a vizinha', () => {
    expect(moveLesson(lessons, 'c', 'down')).toEqual(['a', 'b', 'd', 'c', 'e'])
  })

  test('primeira do módulo subindo não vaza para o módulo de cima', () => {
    expect(moveLesson(lessons, 'c', 'up')).toBeNull()
  })

  test('última do módulo descendo não vaza para o de baixo', () => {
    expect(moveLesson(lessons, 'b', 'down')).toBeNull()
  })

  test('primeira do curso subindo e última descendo não têm para onde ir', () => {
    expect(moveLesson(lessons, 'a', 'up')).toBeNull()
    expect(moveLesson(lessons, 'e', 'down')).toBeNull()
  })

  test('aula fora de módulo troca só com outra solta', () => {
    const withLoose = [...lessons, l('f', 5, null)]
    expect(moveLesson(withLoose, 'f', 'up')).toEqual(['a', 'b', 'c', 'd', 'f', 'e'])
  })

  test('numeração não contígua: pula a de outro módulo no meio', () => {
    const mixed = [l('a', 0, 'm1'), l('x', 1, 'm2'), l('b', 2, 'm1')]
    expect(moveLesson(mixed, 'b', 'up')).toEqual(['b', 'x', 'a'])
  })

  test('lista de um item e id desconhecido', () => {
    expect(moveLesson([l('a', 0, 'm1')], 'a', 'up')).toBeNull()
    expect(moveLesson([l('a', 0, 'm1')], 'a', 'down')).toBeNull()
    expect(moveLesson(lessons, 'nope', 'up')).toBeNull()
  })

  test('empate de `order` desempata por id, sem depender da ordem de entrada', () => {
    const tied = [l('b', 0, 'm1'), l('a', 0, 'm1')]
    expect(moveLesson(tied, 'b', 'up')).toEqual(['b', 'a'])
  })
})

describe('moveModule', () => {
  const modules = [
    { id: 'm1', order: 0 },
    { id: 'm2', order: 1 },
    { id: 'm3', order: 2 },
  ]

  test('troca com o vizinho', () => {
    expect(moveModule(modules, 'm2', 'up')).toEqual(['m2', 'm1', 'm3'])
    expect(moveModule(modules, 'm2', 'down')).toEqual(['m1', 'm3', 'm2'])
  })

  test('bordas', () => {
    expect(moveModule(modules, 'm1', 'up')).toBeNull()
    expect(moveModule(modules, 'm3', 'down')).toBeNull()
    expect(moveModule([{ id: 'm1', order: 0 }], 'm1', 'down')).toBeNull()
  })
})

describe('sequenceLessons — aulas seguem a ordem dos módulos', () => {
  test('módulo que subiu leva as aulas junto; soltas ficam por último', () => {
    const modules = [
      { id: 'm1', order: 1 },
      { id: 'm2', order: 0 },
    ]
    expect(sequenceLessons(modules, lessons)).toEqual(['c', 'd', 'a', 'b', 'e'])
  })

  test('solta no meio da numeração vai para o fim', () => {
    const modules = [{ id: 'm1', order: 0 }]
    const odd = [l('x', 0, null), l('a', 1, 'm1')]
    expect(sequenceLessons(modules, odd)).toEqual(['a', 'x'])
  })
})
