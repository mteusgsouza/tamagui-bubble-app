import { describe, expect, test } from 'vitest'

import { FOCAL_CENTER } from '~/constants/media'
import {
  clampFocal,
  FALLBACK_RATIO,
  focalContentPosition,
  focalPosition,
  MAX_POST_RATIO,
  mediaRatio,
  MIN_POST_RATIO,
  postRatio,
} from '~/features/media/focalPoint'

import type { MediaViewMedia } from '~/features/media/MediaFrame'

const photo = (
  width: number | null,
  height: number | null,
  focal?: { x: number; y: number },
): MediaViewMedia => ({
  id: 'm1',
  kind: 'photo',
  width,
  height,
  focalX: focal?.x,
  focalY: focal?.y,
})

describe('clampFocal — nada fora de 0..1 chega à tela', () => {
  test('ausente, nulo ou lixo volta ao centro', () => {
    // o caso real: mídia antiga, de antes da coluna existir
    expect(clampFocal(undefined)).toBe(FOCAL_CENTER)
    expect(clampFocal(null)).toBe(FOCAL_CENTER)
    expect(clampFocal(Number.NaN)).toBe(FOCAL_CENTER)
    expect(clampFocal(Number.POSITIVE_INFINITY)).toBe(FOCAL_CENTER)
  })

  test('valor fora da faixa é preso nas pontas', () => {
    expect(clampFocal(-2)).toBe(0)
    expect(clampFocal(1.5)).toBe(1)
  })

  test('valor válido passa intacto', () => {
    expect(clampFocal(0)).toBe(0)
    expect(clampFocal(0.37)).toBe(0.37)
    expect(clampFocal(1)).toBe(1)
  })
})

describe('focalPosition — o ponto no vocabulário do CSS', () => {
  test('sem ajuste é o centro, que é o recorte de sempre', () => {
    expect(focalPosition(photo(100, 100))).toBe('50.00% 50.00%')
  })

  test('canto superior esquerdo e inferior direito', () => {
    expect(focalPosition(photo(100, 100, { x: 0, y: 0 }))).toBe('0.00% 0.00%')
    expect(focalPosition(photo(100, 100, { x: 1, y: 1 }))).toBe('100.00% 100.00%')
  })

  test('rosto no alto: o y baixo é o que salva a cabeça no recorte', () => {
    expect(focalPosition(photo(1080, 1920, { x: 0.5, y: 0.2 }))).toBe('50.00% 20.00%')
  })

  test('nativo recebe o mesmo ponto, com os nomes do expo-image', () => {
    expect(focalContentPosition(photo(10, 10, { x: 0.25, y: 0.75 }))).toEqual({
      left: '25.00%',
      top: '75.00%',
    })
  })
})

describe('mediaRatio — a proporção real, sem limite', () => {
  test('sai da dimensão quando ela existe', () => {
    expect(mediaRatio(photo(1600, 900))).toBeCloseTo(16 / 9)
  })

  test('sem dimensão não há o que calcular', () => {
    // é o estado de toda foto que subiu antes de `pickFile.ts` passar a medir
    expect(mediaRatio(photo(null, null))).toBeUndefined()
    expect(mediaRatio(undefined)).toBeUndefined()
  })
})

describe('postRatio — uma proporção para o post inteiro', () => {
  test('post sem mídia não tem proporção', () => {
    expect(postRatio([])).toBeUndefined()
    expect(postRatio(undefined)).toBeUndefined()
  })

  test('áudio não tem proporção: é faixa, não quadro', () => {
    expect(postRatio([{ id: 'a', kind: 'audio' }])).toBeUndefined()
  })

  test('sem dimensão cai no fallback histórico de 16/9', () => {
    expect(postRatio([photo(null, null)])).toBe(FALLBACK_RATIO)
  })

  test('proporção comum passa sem mexer', () => {
    expect(postRatio([photo(1200, 900)])).toBeCloseTo(4 / 3)
  })

  test('🔴 retrato extremo é limitado — senão 9:16 come uma tela e meia', () => {
    expect(postRatio([photo(1080, 1920)])).toBeCloseTo(MIN_POST_RATIO)
  })

  test('panorama extremo também, senão vira uma tira', () => {
    expect(postRatio([photo(2100, 900)])).toBeCloseTo(MAX_POST_RATIO)
  })

  test('🔴 quem decide é a PRIMEIRA mídia, e vale para todas', () => {
    // é isso que impede o carrossel de pular de altura a cada swipe: as outras fotos
    // são recortadas nesta proporção, e o ponto focal escolhe o que sobra
    const items = [photo(1200, 900), { ...photo(1080, 1920), id: 'm2' }]
    expect(postRatio(items)).toBeCloseTo(4 / 3)
  })
})
