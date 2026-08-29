// POST /api/media/upload-url
//
// Cria a linha de `media` com `status: 'pending'` e devolve um PUT assinado. O arquivo
// vai do cliente direto para o R2 — nenhum byte passa por este processo. Depois do PUT,
// o cliente chama /api/media/complete, que confere no bucket antes de marcar `ready`.
//
// A `storageKey` é decidida **aqui**: se viesse do cliente, quem tivesse a rota poderia
// escolher onde escrever dentro do bucket.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'
import { eq } from 'drizzle-orm'

import {
  extensionForMime,
  isAllowedMime,
  isWithinSizeLimit,
  kindForMime,
  MAX_UPLOAD_BYTES,
  normalizeMime,
  POSTER_MIME,
  formatBytes,
} from '~/constants/media'
import { getDb } from '~/database'
import { media } from '~/database/schema-public'
import { authServer } from '~/features/auth/server/authServer'
import { canUploadMedia } from '~/server/media/mediaAccess'
import { buildStorageKey, getSignedUploadUrl, isR2Configured } from '~/server/storage/r2'

import type { MediaKind } from '~/data/models/media'
import type { Endpoint } from 'one'

// `newId()` gera uuid v4; a faixa aceita cobre isso sem deixar passar path traversal
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

type UploadRequestBody = {
  id?: unknown
  kind?: unknown
  mime?: unknown
  sizeBytes?: unknown
  durationSec?: unknown
  width?: unknown
  height?: unknown
  poster?: unknown
}

const fail = (status: number, code: string, message: string) =>
  Response.json({ error: message, code }, { status })

const asOptionalInt = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return fail(401, 'unauthenticated', 'Faça login para subir mídia.')
  if (!canUploadMedia(auth)) {
    return fail(403, 'forbidden', 'Só o criador ou um admin pode subir mídia.')
  }

  if (!isR2Configured()) {
    return fail(
      503,
      'r2-not-configured',
      'R2 não configurado no servidor: veja .env.local.example.',
    )
  }

  let body: UploadRequestBody
  try {
    body = (await request.json()) as UploadRequestBody
  } catch {
    return fail(400, 'invalid-json', 'Corpo da requisição não é JSON.')
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!ID_PATTERN.test(id)) {
    return fail(400, 'invalid-id', 'Id inválido: gere com newId() de ~/helpers/id.')
  }

  const mime = typeof body.mime === 'string' ? normalizeMime(body.mime) : ''
  const derivedKind = kindForMime(mime)
  if (!derivedKind) {
    return fail(400, 'unsupported-mime', `Tipo de arquivo não suportado: ${mime || '?'}`)
  }

  // `kind` é opcional; quando vem, tem que bater com o mime
  const kind = (typeof body.kind === 'string' ? body.kind : derivedKind) as MediaKind
  if (kind !== derivedKind || !isAllowedMime(kind, mime)) {
    return fail(400, 'kind-mismatch', `O mime ${mime} não corresponde a "${kind}".`)
  }

  const sizeBytes = asOptionalInt(body.sizeBytes)
  if (!sizeBytes || !isWithinSizeLimit(kind, sizeBytes)) {
    const limit = formatBytes(MAX_UPLOAD_BYTES[kind])
    return fail(413, 'too-large', `Arquivo de ${kind} passa do limite de ${limit}.`)
  }

  const db = getDb()
  const [existing] = await db.select().from(media).where(eq(media.id, id)).limit(1)

  if (existing && existing.ownerId !== auth.id) {
    return fail(409, 'id-taken', 'Esse id de mídia já pertence a outra pessoa.')
  }
  if (existing && existing.status === 'ready') {
    return fail(409, 'already-uploaded', 'Essa mídia já foi finalizada.')
  }

  // reaproveita a chave numa retentativa: o PUT anterior pode ter subido metade do
  // arquivo, e sobrescrever a mesma chave é o comportamento desejado
  const storageKey =
    existing?.storageKey ??
    buildStorageKey({
      ownerId: auth.id,
      mediaId: id,
      extension: extensionForMime(mime),
    })

  const wantsPoster = body.poster === true && kind !== 'photo'
  const posterKey =
    existing?.posterKey ??
    (wantsPoster
      ? buildStorageKey({
          ownerId: auth.id,
          mediaId: id,
          extension: extensionForMime(POSTER_MIME),
          suffix: 'poster',
        })
      : null)

  const row = {
    id,
    ownerId: auth.id,
    provider: 'r2' as const,
    storageKey,
    posterKey,
    mime,
    kind,
    sizeBytes,
    durationSec: asOptionalInt(body.durationSec),
    width: asOptionalInt(body.width),
    height: asOptionalInt(body.height),
    status: 'pending' as const,
  }

  try {
    if (existing) {
      await db.update(media).set(row).where(eq(media.id, id))
    } else {
      await db.insert(media).values({ ...row, createdAt: new Date().toISOString() })
    }
  } catch (err) {
    console.error(`[media] falha ao gravar media ${id}`, err)
    return fail(500, 'db-error', 'Não foi possível registrar a mídia.')
  }

  try {
    const upload = getSignedUploadUrl({ key: storageKey, contentType: mime })
    const posterUpload = posterKey
      ? getSignedUploadUrl({ key: posterKey, contentType: POSTER_MIME })
      : undefined

    return Response.json({
      mediaId: id,
      kind,
      mime,
      storageKey,
      posterKey,
      upload,
      posterUpload,
    })
  } catch (err) {
    console.error(`[media] falha ao assinar upload de ${id}`, err)
    return fail(500, 'sign-error', 'Não foi possível assinar a URL de upload.')
  }
}
