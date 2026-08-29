import { describe, expect, test } from 'vitest'

import {
  ALLOWED_MIME,
  extensionForMime,
  isAllowedMime,
  isWithinSizeLimit,
  kindForMime,
  MAX_UPLOAD_BYTES,
  MEDIA_KINDS,
  normalizeMime,
} from '~/constants/media'

// Estas regras rodam duas vezes: na tela, antes de subir, e na rota, que não confia na
// tela. Se elas divergirem, o usuário vê um erro só depois de mandar o arquivo inteiro.

describe('normalizeMime', () => {
  test('corta parâmetro e normaliza caixa', () => {
    expect(normalizeMime('IMAGE/JPEG')).toBe('image/jpeg')
    expect(normalizeMime('video/mp4; codecs="avc1"')).toBe('video/mp4')
    expect(normalizeMime('  audio/mpeg  ')).toBe('audio/mpeg')
  })
})

describe('kindForMime', () => {
  test('deriva o kind de cada família', () => {
    expect(kindForMime('image/png')).toBe('photo')
    expect(kindForMime('video/quicktime')).toBe('video')
    expect(kindForMime('audio/mpeg')).toBe('audio')
  })

  test('mime fora da allowlist não vira kind nenhum', () => {
    expect(kindForMime('application/pdf')).toBeNull()
    expect(kindForMime('image/tiff')).toBeNull()
    expect(kindForMime('')).toBeNull()
  })

  test('aceita mime com parâmetro, como o navegador manda', () => {
    expect(kindForMime('video/mp4; codecs="avc1.42E01E"')).toBe('video')
  })
})

describe('isAllowedMime', () => {
  test('mime válido no kind errado é recusado', () => {
    // é o caso que impede subir vídeo assinando a URL como foto
    expect(isAllowedMime('photo', 'video/mp4')).toBe(false)
    expect(isAllowedMime('video', 'video/mp4')).toBe(true)
  })
})

describe('extensionForMime', () => {
  test('cada mime da allowlist tem extensão própria', () => {
    for (const kind of MEDIA_KINDS) {
      for (const mime of ALLOWED_MIME[kind]) {
        expect(extensionForMime(mime)).not.toBe('bin')
      }
    }
  })

  test('mime desconhecido cai em .bin, nunca em undefined', () => {
    // a extensão vira segmento da storageKey: undefined ali quebraria a assinatura
    expect(extensionForMime('application/octet-stream')).toBe('bin')
  })
})

describe('isWithinSizeLimit', () => {
  test('recusa tamanho zero ou negativo', () => {
    expect(isWithinSizeLimit('photo', 0)).toBe(false)
    expect(isWithinSizeLimit('photo', -1)).toBe(false)
  })

  test('aceita exatamente no limite e recusa um byte acima', () => {
    expect(isWithinSizeLimit('video', MAX_UPLOAD_BYTES.video)).toBe(true)
    expect(isWithinSizeLimit('video', MAX_UPLOAD_BYTES.video + 1)).toBe(false)
  })

  test('todos os limites cabem em int4 — `media.sizeBytes` é int4 no Postgres', () => {
    for (const kind of MEDIA_KINDS) {
      expect(MAX_UPLOAD_BYTES[kind]).toBeLessThan(2_147_483_647)
    }
  })
})
