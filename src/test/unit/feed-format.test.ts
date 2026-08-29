import { describe, expect, test } from 'vitest'

import {
  fullDate,
  plural,
  timeAgo,
  visibilityLabel,
} from '~/features/feed/formatDate'
import { postMediaItems } from '~/features/feed/types'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const agoBy = (ms: number) => Date.now() - ms

describe('timeAgo', () => {
  test('sem data devolve string vazia — rascunho não tem publishedAt', () => {
    expect(timeAgo(null)).toBe('')
    expect(timeAgo(undefined)).toBe('')
    expect(timeAgo(0)).toBe('')
  })

  test('menos de um minuto vira "agora"', () => {
    expect(timeAgo(agoBy(5_000))).toBe('agora')
  })

  test('minutos e horas', () => {
    expect(timeAgo(agoBy(12 * MINUTE))).toBe('há 12 min')
    expect(timeAgo(agoBy(2 * HOUR))).toBe('há 2 h')
  })

  test('um dia é "ontem", vários dias contam', () => {
    expect(timeAgo(agoBy(DAY + HOUR))).toBe('ontem')
    expect(timeAgo(agoBy(5 * DAY))).toBe('há 5 dias')
  })

  test('acima de 30 dias troca para data absoluta', () => {
    const result = timeAgo(agoBy(60 * DAY))
    expect(result).not.toContain('há')
    expect(result).toMatch(/de/)
  })
})

describe('fullDate', () => {
  test('sem data devolve string vazia', () => {
    expect(fullDate(null)).toBe('')
  })

  test('traz dia, mês e hora', () => {
    // meio-dia UTC evita o dia virar dependendo do fuso de quem roda o teste
    const result = fullDate(Date.UTC(2026, 7, 14, 12, 0))
    expect(result).toContain('agosto')
    expect(result).toMatch(/\d{2}:\d{2}/)
  })
})

describe('visibilityLabel', () => {
  test('mapeia os dois valores do schema', () => {
    expect(visibilityLabel('public')).toBe('aberto a todos')
    expect(visibilityLabel('subscribers')).toBe('assinantes')
  })
})

describe('plural', () => {
  test('singular só no 1', () => {
    expect(plural(0, 'comentário', 'comentários')).toBe('0 comentários')
    expect(plural(1, 'comentário', 'comentários')).toBe('1 comentário')
    expect(plural(2, 'comentário', 'comentários')).toBe('2 comentários')
  })
})

describe('postMediaItems', () => {
  const media = (id: string) => ({ id, kind: 'photo' as const })

  test('post sem mídia devolve lista vazia', () => {
    expect(postMediaItems({})).toEqual([])
    expect(postMediaItems({ media: [] })).toEqual([])
  })

  test('preserva a ordem que a query entregou', () => {
    const items = postMediaItems({
      media: [
        { id: 'pm1', media: media('a') },
        { id: 'pm2', media: media('b') },
      ],
    })
    expect(items.map((item) => item.id)).toEqual(['a', 'b'])
  })

  test('descarta vínculo sem mídia', () => {
    // acontece de verdade: `postMedia` existe mas a linha de `media` não sincronizou
    const items = postMediaItems({
      media: [
        { id: 'pm1', media: null },
        { id: 'pm2', media: media('b') },
        { id: 'pm3' },
      ],
    })
    expect(items.map((item) => item.id)).toEqual(['b'])
  })
})
