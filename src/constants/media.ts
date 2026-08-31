// Limites e tipos de mídia. Isomórfico de propósito: a tela valida antes de subir
// (para dar erro imediato) e a rota valida de novo no servidor (porque a checagem do
// cliente não vale nada). Mudou aqui, mudou nos dois lados.

import type { MediaKind } from '~/data/models/media'

export const MEDIA_KINDS = ['photo', 'video', 'audio'] as const

// `media.sizeBytes` é `int4` no Postgres: teto absoluto de ~2,1 GB por arquivo.
// Estes limites ficam bem abaixo disso de propósito — o upload é um PUT único, sem
// multipart, então o arquivo inteiro atravessa uma conexão só.
export const MAX_UPLOAD_BYTES: Record<MediaKind, number> = {
  photo: 25 * 1024 * 1024, //  25 MB
  audio: 200 * 1024 * 1024, // 200 MB
  video: 1024 * 1024 * 1024, //  1 GB
}

/** Teto global — usado pela validação genérica antes de saber o `kind`. */
export const MAX_UPLOAD_BYTES_ANY = Math.max(...Object.values(MAX_UPLOAD_BYTES))

// Allowlist de mime. Não aceitamos `image/*` genérico: mime é o que decide a extensão
// do objeto no R2 e o `Content-Type` assinado na URL de upload.
export const ALLOWED_MIME: Record<MediaKind, readonly string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm'],
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
}

/**
 * TTL da URL assinada de imagem (foto e poster). Curto: ela vaza no DOM e nos logs do
 * navegador, e a requisição acontece na hora — 5 min sobra.
 */
export const PLAYBACK_URL_TTL_SEC = 300

/**
 * TTL de vídeo e áudio. Bem maior de propósito.
 *
 * O player não faz uma requisição só: ele pede faixas (`Range`) durante a reprodução
 * inteira, e cada uma revalida a assinatura. Com 5 min, um seek aos 6 minutos de aula
 * quebraria. E renovar por timer não resolve — trocar o `src` no meio reinicia o vídeo.
 * Então a URL nasce válida pelo tempo de uma sessão de leitura, e só é renovada quando
 * o player de fato falha (`reload()` de `useSignedPlayback`).
 */
export const MEDIA_STREAM_TTL_SEC = 4 * 60 * 60

/** TTL da URL assinada de upload. Maior porque o PUT do arquivo inteiro cabe dentro. */
export const UPLOAD_URL_TTL_SEC = 900

/**
 * Quantas fotos cabem num post.
 *
 * Vídeo e áudio ficam em 1 por post: `post.kind` é um valor único, então misturar
 * tipos deixaria o rótulo do card do feed mentindo. Foto é a exceção porque carrossel
 * de fotos é o caso comum.
 */
export const MAX_PHOTOS_PER_POST = 9

/** Poster (frame de capa) é sempre imagem, independente do `kind` da mídia. */
export const POSTER_MIME = 'image/jpeg'

export const normalizeMime = (mime: string) => mime.split(';')[0]!.trim().toLowerCase()

/** `kind` a partir do mime — `null` quando o tipo não está na allowlist. */
export function kindForMime(mime: string): MediaKind | null {
  const normalized = normalizeMime(mime)
  for (const kind of MEDIA_KINDS) {
    if (ALLOWED_MIME[kind].includes(normalized)) return kind
  }
  return null
}

export function isAllowedMime(kind: MediaKind, mime: string) {
  return ALLOWED_MIME[kind].includes(normalizeMime(mime))
}

export function extensionForMime(mime: string) {
  return EXTENSION_BY_MIME[normalizeMime(mime)] || 'bin'
}

export function isWithinSizeLimit(kind: MediaKind, sizeBytes: number) {
  return sizeBytes > 0 && sizeBytes <= MAX_UPLOAD_BYTES[kind]
}

export const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`
  return `${Math.round(bytes / 1024)} KB`
}
