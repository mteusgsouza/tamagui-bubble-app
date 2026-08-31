// Cliente S3-compatível para o Cloudflare R2, só com o que a Fase 5 usa: URLs
// pré-assinadas (SigV4 por query string) para PUT, GET e HEAD.
//
// Por que não o `@aws-sdk/client-s3`: presign é ~120 linhas de HMAC e o SDK arrasta
// dezenas de MB para dentro do bundle do servidor. Nenhum byte de mídia passa por este
// processo — quem sobe e quem baixa é o cliente, direto no R2.
//
// Server-only: importa `~/server/env-server`, que lança se for carregado no browser.

import { createHash, createHmac } from 'node:crypto'

import { PLAYBACK_URL_TTL_SEC, UPLOAD_URL_TTL_SEC } from '~/constants/media'
import {
  CLOUDFLARE_R2_ACCESS_KEY,
  CLOUDFLARE_R2_BUCKET,
  CLOUDFLARE_R2_ENDPOINT,
  CLOUDFLARE_R2_SECRET_KEY,
} from '~/server/env-server'

// o R2 não tem regiões: a assinatura sempre usa `auto`
const REGION = 'auto'
const SERVICE = 's3'
const ALGORITHM = 'AWS4-HMAC-SHA256'
// presign nunca assina o corpo — o arquivo só existe no cliente
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'

export class R2NotConfiguredError extends Error {
  constructor() {
    super(
      'R2 não configurado: defina CLOUDFLARE_R2_ENDPOINT, CLOUDFLARE_R2_BUCKET, ' +
        'CLOUDFLARE_R2_ACCESS_KEY e CLOUDFLARE_R2_SECRET_KEY em .env.local',
    )
    this.name = 'R2NotConfiguredError'
  }
}

export const isR2Configured = () =>
  Boolean(
    CLOUDFLARE_R2_ENDPOINT &&
    CLOUDFLARE_R2_BUCKET &&
    CLOUDFLARE_R2_ACCESS_KEY &&
    CLOUDFLARE_R2_SECRET_KEY,
  )

// --- SigV4 ---

/**
 * RFC 3986. `encodeURIComponent` deixa passar `!'()*`, que a AWS exige codificados —
 * um caractere desses num nome de arquivo faria a assinatura não bater.
 */
const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )

/** O path é codificado segmento a segmento: as barras continuam barras. */
const encodeKeyPath = (key: string) => key.split('/').map(encodeRfc3986).join('/')

/** `2026-08-29T12:00:00.000Z` se torna `20260829T120000Z` */
const toAmzDate = (date: Date) => date.toISOString().replace(/[:-]|\.\d{3}/g, '')

const hmac = (key: Buffer | string, data: string) =>
  createHmac('sha256', key).update(data, 'utf8').digest()

const sha256Hex = (data: string) =>
  createHash('sha256').update(data, 'utf8').digest('hex')

const getSigningKey = (dateStamp: string) => {
  const kDate = hmac(`AWS4${CLOUDFLARE_R2_SECRET_KEY}`, dateStamp)
  const kRegion = hmac(kDate, REGION)
  const kService = hmac(kRegion, SERVICE)
  return hmac(kService, 'aws4_request')
}

type PresignArgs = {
  method: 'GET' | 'PUT' | 'HEAD'
  key: string
  expiresIn: number
  /** cabeçalhos assinados além de `host`. Quem chamar a URL tem que mandá-los iguais. */
  headers?: Record<string, string>
  /** parâmetros extras assinados (ex.: `response-content-type`). */
  query?: Record<string, string>
}

function presign({ method, key, expiresIn, headers = {}, query = {} }: PresignArgs) {
  if (!isR2Configured()) throw new R2NotConfiguredError()

  const endpoint = new URL(CLOUDFLARE_R2_ENDPOINT)
  const host = endpoint.host
  // endpoint com path (raro, mas o R2 aceita) precisa entrar no canonical URI
  const basePath = endpoint.pathname.replace(/\/+$/, '')
  const bucket = encodeRfc3986(CLOUDFLARE_R2_BUCKET)
  const canonicalUri = `${basePath}/${bucket}/${encodeKeyPath(key)}`

  const amzDate = toAmzDate(new Date())
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`

  // cabeçalhos canônicos: chaves minúsculas, ordenadas, valores com espaço colapsado
  const signedHeaderMap: Record<string, string> = { host }
  for (const [name, value] of Object.entries(headers)) {
    signedHeaderMap[name.toLowerCase()] = value.trim().replace(/\s+/g, ' ')
  }
  const signedHeaderNames = Object.keys(signedHeaderMap).sort()
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${signedHeaderMap[name]}\n`)
    .join('')
  const signedHeaders = signedHeaderNames.join(';')

  const queryParams: Record<string, string> = {
    ...query,
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${CLOUDFLARE_R2_ACCESS_KEY}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.floor(expiresIn)),
    'X-Amz-SignedHeaders': signedHeaders,
  }
  const canonicalQuery = Object.keys(queryParams)
    .sort()
    .map((name) => `${encodeRfc3986(name)}=${encodeRfc3986(queryParams[name]!)}`)
    .join('&')

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    UNSIGNED_PAYLOAD,
  ].join('\n')

  const stringToSign = [ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n')
  const signature = hmac(getSigningKey(dateStamp), stringToSign).toString('hex')

  const origin = `${endpoint.protocol}//${host}`
  const search = `${canonicalQuery}&X-Amz-Signature=${signature}`

  return {
    url: `${origin}${canonicalUri}?${search}`,
    expiresAt: Date.now() + expiresIn * 1000,
  }
}

// --- API pública ---

/**
 * Caminho do objeto no bucket. Montado **no servidor**: nada que veio do cliente entra
 * aqui sem passar por `id` (uuid) e extensão derivada do mime da allowlist — nome de
 * arquivo do usuário nunca vira segmento de path.
 */
export function buildStorageKey({
  ownerId,
  mediaId,
  extension,
  suffix,
}: {
  ownerId: string
  mediaId: string
  extension: string
  /** `poster` gera o objeto irmão da capa de vídeo/áudio */
  suffix?: 'poster'
}) {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const safeOwner = ownerId.replace(/[^A-Za-z0-9_-]/g, '')
  const safeId = mediaId.replace(/[^A-Za-z0-9_-]/g, '')
  const name = suffix ? `${safeId}-${suffix}` : safeId
  return `media/${safeOwner}/${year}/${month}/${name}.${extension}`
}

export type SignedUpload = {
  url: string
  method: 'PUT'
  /** o cliente tem que mandar exatamente estes cabeçalhos, senão o R2 devolve 403 */
  headers: Record<string, string>
  expiresAt: number
}

/**
 * URL de PUT. O `Content-Type` entra na assinatura de propósito: sem isso o cliente
 * poderia subir qualquer coisa na chave que acabamos de autorizar.
 */
export function getSignedUploadUrl({
  key,
  contentType,
  expiresIn = UPLOAD_URL_TTL_SEC,
}: {
  key: string
  contentType: string
  expiresIn?: number
}): SignedUpload {
  const { url, expiresAt } = presign({
    method: 'PUT',
    key,
    expiresIn,
    headers: { 'content-type': contentType },
  })
  return { url, method: 'PUT', headers: { 'Content-Type': contentType }, expiresAt }
}

/**
 * URL de leitura, TTL curto. `contentType` vira `response-content-type` para o
 * navegador receber o mime certo mesmo se o objeto tiver sido gravado sem ele.
 */
export function getSignedPlaybackUrl(
  key: string,
  ttlSec = PLAYBACK_URL_TTL_SEC,
  options?: { contentType?: string; downloadName?: string },
) {
  const query: Record<string, string> = {}
  if (options?.contentType) query['response-content-type'] = options.contentType
  if (options?.downloadName) {
    const safeName = options.downloadName.replace(/"/g, '')
    query['response-content-disposition'] = `attachment; filename="${safeName}"`
  }
  return presign({ method: 'GET', key, expiresIn: ttlSec, query })
}

export type ObjectHead = { sizeBytes: number; mime?: string }

/**
 * HEAD no objeto. É o que prova que o upload realmente aconteceu — sem isso o cliente
 * poderia marcar `status: 'ready'` numa mídia que nunca chegou ao bucket.
 */
export async function headObject(key: string): Promise<ObjectHead | null> {
  const { url } = presign({ method: 'HEAD', key, expiresIn: 60 })
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (!res.ok) return null
    return {
      sizeBytes: Number(res.headers.get('content-length') || 0),
      mime: res.headers.get('content-type') || undefined,
    }
  } catch (err) {
    console.error(`[r2] HEAD falhou para ${key}`, err)
    return null
  }
}
