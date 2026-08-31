import { describe, expect, test } from 'vitest'

import { MAX_PHOTOS_PER_POST } from '~/constants/media'
import {
  acceptKind,
  canAddMore,
  deriveKind,
  remainingSlots,
  withMedia,
} from '~/features/admin/postMediaRules'

import type { AttachedMedia } from '~/features/admin/postMediaRules'
import type { PostKind } from '~/data/types'

const link = (id: string, kind: PostKind): AttachedMedia => ({
  id: `pm-${id}`,
  media: { id, kind },
})

const photos = (count: number) =>
  Array.from({ length: count }, (_, i) => link(`f${i}`, 'photo'))

describe('deriveKind — o tipo sai do arquivo, ninguém escolhe', () => {
  test('post sem mídia é texto', () => {
    expect(deriveKind([])).toBe('text')
  })

  test('o primeiro arquivo define o post', () => {
    expect(deriveKind([link('a', 'photo')])).toBe('photo')
    expect(deriveKind([link('a', 'video')])).toBe('video')
    expect(deriveKind([link('a', 'audio')])).toBe('audio')
  })

  test('vínculo sem mídia carregada não conta', () => {
    // acontece de verdade: `postMedia` existe mas a linha de `media` não sincronizou
    const orphan: AttachedMedia = { id: 'pm-x', media: null }
    expect(deriveKind([orphan])).toBe('text')
    expect(deriveKind([orphan, link('a', 'photo')])).toBe('photo')
    expect(withMedia([orphan, link('a', 'photo')])).toHaveLength(1)
  })
})

describe('remainingSlots — quantas ainda cabem', () => {
  test('post vazio abre o limite de fotos', () => {
    expect(remainingSlots([])).toBe(MAX_PHOTOS_PER_POST)
  })

  test('foto vai descontando até fechar em 9', () => {
    expect(remainingSlots(photos(1))).toBe(MAX_PHOTOS_PER_POST - 1)
    expect(remainingSlots(photos(8))).toBe(1)
    expect(remainingSlots(photos(MAX_PHOTOS_PER_POST))).toBe(0)
  })

  test('vídeo e áudio ocupam o post sozinhos', () => {
    // é o que impede o card do feed de mentir: `post.kind` é um valor só
    expect(remainingSlots([link('a', 'video')])).toBe(0)
    expect(remainingSlots([link('a', 'audio')])).toBe(0)
    expect(canAddMore([link('a', 'video')])).toBe(false)
  })

  test('nunca devolve negativo, mesmo com mais fotos que o limite', () => {
    // dado inconsistente no banco não pode virar botão quebrado
    expect(remainingSlots(photos(MAX_PHOTOS_PER_POST + 3))).toBe(0)
  })
})

describe('acceptKind — o que o seletor aceita', () => {
  test('vazio aceita qualquer coisa: o primeiro arquivo decide', () => {
    expect(acceptKind([])).toBe('any')
  })

  test('depois da primeira foto, só foto', () => {
    // senão o usuário escolheria um vídeo que seria recusado depois do upload
    expect(acceptKind(photos(1))).toBe('photo')
  })
})
