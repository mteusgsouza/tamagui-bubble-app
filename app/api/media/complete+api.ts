// POST /api/media/complete
//
// Fecha o upload: confere no bucket que o objeto realmente chegou e só então marca
// `status: 'ready'`.
//
// Por que não deixar o cliente marcar `ready` por mutation do Zero: (a) ele poderia
// marcar mídia que nunca subiu, e (b) a linha nasce aqui no servidor, então o cliente
// só a teria no cache local depois do sync — um `update` otimista antes disso corre
// atrás da própria sombra. Aqui é uma escrita só, sem corrida.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'
import { eq } from 'drizzle-orm'

import { getDb } from '~/database'
import { media } from '~/database/schema-public'
import { authServer } from '~/features/auth/server/authServer'
import { canUploadMedia } from '~/server/media/mediaAccess'
import { headObject, isR2Configured } from '~/server/storage/r2'

import type { Endpoint } from 'one'

// `media.sizeBytes` é int4: o valor lido do bucket é fixado no teto para não estourar
const INT4_MAX = 2_147_483_647

type CompleteRequestBody = {
  id?: unknown
  durationSec?: unknown
  width?: unknown
  height?: unknown
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
    return fail(503, 'r2-not-configured', 'R2 não configurado no servidor.')
  }

  let body: CompleteRequestBody
  try {
    body = (await request.json()) as CompleteRequestBody
  } catch {
    return fail(400, 'invalid-json', 'Corpo da requisição não é JSON.')
  }

  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return fail(400, 'invalid-id', 'Informe o id da mídia.')

  const db = getDb()
  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1)
  if (!row) return fail(404, 'not-found', 'Mídia não encontrada.')
  if (row.ownerId !== auth.id && auth.role !== 'admin') {
    return fail(403, 'forbidden', 'Essa mídia não é sua.')
  }

  const head = await headObject(row.storageKey)

  if (!head) {
    // o objeto não está lá: registra o fracasso em vez de deixar `pending` para sempre
    await db.update(media).set({ status: 'failed' }).where(eq(media.id, id))
    return fail(
      422,
      'object-missing',
      'O arquivo não chegou ao bucket. Refaça o upload.',
    )
  }

  // poster é opcional: se foi pedido mas não subiu, some do registro em vez de virar
  // uma referência quebrada no player
  const posterHead = row.posterKey ? await headObject(row.posterKey) : null

  const sizeBytes = Math.min(head.sizeBytes || row.sizeBytes, INT4_MAX)

  await db
    .update(media)
    .set({
      status: 'ready',
      sizeBytes,
      posterKey: posterHead ? row.posterKey : null,
      durationSec: asOptionalInt(body.durationSec) ?? row.durationSec,
      width: asOptionalInt(body.width) ?? row.width,
      height: asOptionalInt(body.height) ?? row.height,
    })
    .where(eq(media.id, id))

  return Response.json({
    mediaId: id,
    status: 'ready',
    sizeBytes,
    hasPoster: Boolean(posterHead),
  })
}
