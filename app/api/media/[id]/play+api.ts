// GET /api/media/[id]/play
//
// **É aqui que o paywall vale de verdade.** O gate do Zero esconde metadado; esta rota
// protege os bytes. Ela relê a assinatura direto do Postgres — nada de claim de JWT, que
// no Takeout dura 3 anos — e só então assina uma URL do R2 com TTL curto.
//
// Query:
//   ?variant=poster   serve `posterKey` em vez de `storageKey`
//   ?format=json      devolve { url, expiresAt } em vez do 302
//
// O 302 é o caminho do `<video src>` no navegador (o cookie de sessão viaja sozinho).
// O `format=json` existe para o nativo, onde a sessão é Bearer e um player não tem como
// mandar cabeçalho: o app busca a URL assinada e entrega ao player já pronta.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import {
  MEDIA_STREAM_TTL_SEC,
  PLAYBACK_URL_TTL_SEC,
  POSTER_MIME,
} from '~/constants/media'
import { authServer } from '~/features/auth/server/authServer'
import { resolveMediaAccess } from '~/server/media/mediaAccess'
import { getSignedPlaybackUrl, isR2Configured } from '~/server/storage/r2'

import type { Endpoint } from 'one'

// o `Endpoint` do One só declara `(req)`, mas o runtime chama `(req, { params })`.
// Em vez de brigar com o tipo, tiramos o id do path — é o mesmo que o handler de auth
// faz em src/features/auth/server/apiHandler.ts.
const ID_FROM_PATH = /\/api\/media\/([^/]+)\/play\/?$/

const fail = (status: number, code: string, message: string) =>
  Response.json({ error: message, code }, { status })

export const GET: Endpoint = async (request) => {
  const url = new URL(request.url)
  const id = ID_FROM_PATH.exec(url.pathname)?.[1]
  if (!id) return fail(400, 'invalid-id', 'Id de mídia ausente na URL.')

  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return fail(401, 'unauthenticated', 'Faça login para ver esta mídia.')

  if (!isR2Configured()) {
    return fail(503, 'r2-not-configured', 'R2 não configurado no servidor.')
  }

  const access = await resolveMediaAccess(decodeURIComponent(id), auth)

  if (!access.allowed) {
    if (access.reason === 'media-not-found') {
      return fail(404, 'not-found', 'Mídia não encontrada.')
    }
    // 403 é a resposta que o teste de `curl` da Fase 5 procura
    return fail(403, access.reason, 'Você não tem acesso a esta mídia.')
  }

  const row = access.media
  const isPrivileged = access.reason === 'owner' || access.reason === 'admin'

  // upload ainda não confirmado: só o dono/admin pode espiar
  if (row.status !== 'ready' && !isPrivileged) {
    return fail(409, 'not-ready', 'Esta mídia ainda está sendo processada.')
  }

  const wantsPoster = url.searchParams.get('variant') === 'poster'
  if (wantsPoster && !row.posterKey) {
    return fail(404, 'no-poster', 'Esta mídia não tem capa.')
  }

  const key = wantsPoster ? row.posterKey! : row.storageKey
  const contentType = wantsPoster ? POSTER_MIME : row.mime

  // imagem é uma requisição só; vídeo/áudio revalidam a assinatura a cada `Range`
  const isStream = !wantsPoster && (row.kind === 'video' || row.kind === 'audio')
  const ttl = isStream ? MEDIA_STREAM_TTL_SEC : PLAYBACK_URL_TTL_SEC

  let signed: { url: string; expiresAt: number }
  try {
    signed = getSignedPlaybackUrl(key, ttl, { contentType })
  } catch (err) {
    console.error(`[media] falha ao assinar playback de ${row.id}`, err)
    return fail(500, 'sign-error', 'Não foi possível assinar a URL de leitura.')
  }

  if (url.searchParams.get('format') === 'json') {
    return Response.json(
      {
        mediaId: row.id,
        kind: row.kind,
        mime: contentType,
        variant: wantsPoster ? 'poster' : 'original',
        url: signed.url,
        expiresAt: signed.expiresAt,
        durationSec: row.durationSec,
        width: row.width,
        height: row.height,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  // a URL assinada não pode ser cacheada por proxy nenhum: ela É a credencial
  return new Response(null, {
    status: 302,
    headers: {
      Location: signed.url,
      'Cache-Control': 'private, no-store',
    },
  })
}
