// O editor de posts, do lado do servidor.
//
// A tela antiga tinha `createdRef`, `createAckRef`, `savedKindRef` e quatro mutations
// encadeadas para salvar um post, porque o corpo mora em outra tabela desde a Fase 12 e
// o CRUD gerado pelo Zero não tinha upsert. Aqui é **uma** chamada numa transação.

import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { getDb } from '~/database'
import { media, post, postContent, postMedia, plan } from '~/database/schema-public'
import { requireContentAdmin } from '~/server/access/viewer'
import { nowIso, toEpoch } from '~/server/api/serialize'

import type { MediaDTO, PostMediaDTO } from './dto'
import type { PostKind, Visibility } from '~/data/enums'
import type { WriteResult } from './interactions'
import type { Viewer } from '~/server/access/viewer'

/** O post como o editor precisa: sem gate de tier, com rascunho e apagado. */
export type AdminPostDTO = {
  id: string
  feedOwnerId: string
  kind: string
  title: string | null
  teaser: string | null
  visibility: string
  requiredPlanId: string | null
  published: boolean
  publishedAt: number | null
  deleted: boolean
  likeCount: number
  commentCount: number
  createdAt: number | null
  content: { body: string | null } | null
  media: PostMediaDTO[]
  requiredPlan: { id: string; name: string } | null
}

const forbidden = () =>
  ({
    ok: false as const,
    status: 403,
    code: 'forbidden',
    message: 'Só o criador administra o conteúdo.',
  })

const notFound = (message = 'Post não encontrado.') =>
  ({ ok: false as const, status: 404, code: 'not-found', message })

async function loadPostMedia(ids: string[]) {
  const byPost = new Map<string, PostMediaDTO[]>()
  if (!ids.length) return byPost

  const db = getDb()
  const rows = await db
    .select({
      id: postMedia.id,
      postId: postMedia.postId,
      position: postMedia.position,
      mediaId: media.id,
      kind: media.kind,
      mime: media.mime,
      posterKey: media.posterKey,
      durationSec: media.durationSec,
      width: media.width,
      height: media.height,
    })
    .from(postMedia)
    .leftJoin(media, eq(media.id, postMedia.mediaId))
    .where(inArray(postMedia.postId, ids))
    .orderBy(postMedia.postId, postMedia.position)

  for (const row of rows) {
    const item: MediaDTO | null = row.mediaId
      ? {
          id: row.mediaId,
          kind: row.kind ?? '',
          mime: row.mime,
          posterKey: row.posterKey,
          durationSec: row.durationSec,
          width: row.width,
          height: row.height,
        }
      : null
    const list = byPost.get(row.postId) ?? []
    list.push({ id: row.id, position: row.position, media: item })
    byPost.set(row.postId, list)
  }
  return byPost
}

/** A lista do editor: inclui rascunho e apagado, ordenada pela criação. */
export async function loadAdminPosts(
  viewer: Viewer,
  options: { feedOwnerId: string; limit?: number },
): Promise<AdminPostDTO[] | null> {
  if (!requireContentAdmin(viewer)) return null

  const db = getDb()
  const rows = await db
    .select({ post, planId: plan.id, planName: plan.name })
    .from(post)
    .leftJoin(plan, eq(plan.id, post.requiredPlanId))
    .where(eq(post.feedOwnerId, options.feedOwnerId))
    .orderBy(desc(post.createdAt))
    .limit(options.limit ?? 200)

  const mediaByPost = await loadPostMedia(rows.map((row) => row.post.id))

  return rows.map((row) => ({
    id: row.post.id,
    feedOwnerId: row.post.feedOwnerId,
    kind: row.post.kind,
    title: row.post.title,
    teaser: row.post.teaser,
    visibility: row.post.visibility,
    requiredPlanId: row.post.requiredPlanId,
    published: row.post.published,
    publishedAt: toEpoch(row.post.publishedAt),
    deleted: row.post.deleted,
    likeCount: row.post.likeCount,
    commentCount: row.post.commentCount,
    createdAt: toEpoch(row.post.createdAt),
    content: null,
    media: mediaByPost.get(row.post.id) ?? [],
    requiredPlan: row.planId ? { id: row.planId, name: row.planName ?? '' } : null,
  }))
}

/** Um post para editar. O corpo vem **sempre** — o dono lê o próprio rascunho. */
export async function loadAdminPost(
  viewer: Viewer,
  postId: string,
): Promise<AdminPostDTO | null | 'forbidden'> {
  if (!requireContentAdmin(viewer)) return 'forbidden'

  const db = getDb()
  const [row] = await db
    .select({ post, body: postContent.body, planId: plan.id, planName: plan.name })
    .from(post)
    .leftJoin(postContent, eq(postContent.postId, post.id))
    .leftJoin(plan, eq(plan.id, post.requiredPlanId))
    .where(eq(post.id, postId))
    .limit(1)

  if (!row) return null

  const mediaByPost = await loadPostMedia([postId])

  return {
    id: row.post.id,
    feedOwnerId: row.post.feedOwnerId,
    kind: row.post.kind,
    title: row.post.title,
    teaser: row.post.teaser,
    visibility: row.post.visibility,
    requiredPlanId: row.post.requiredPlanId,
    published: row.post.published,
    publishedAt: toEpoch(row.post.publishedAt),
    deleted: row.post.deleted,
    likeCount: row.post.likeCount,
    commentCount: row.post.commentCount,
    createdAt: toEpoch(row.post.createdAt),
    // sempre presente: o dono lê o próprio rascunho, sem gate. Corpo vazio é corpo vazio,
    // não "bloqueado" — a distinção que `isPostLocked` faz não se aplica aqui.
    content: { body: row.body },
    media: mediaByPost.get(postId) ?? [],
    requiredPlan: row.planId ? { id: row.planId, name: row.planName ?? '' } : null,
  }
}

export type SavePostArgs = {
  id: string
  feedOwnerId: string
  kind: PostKind
  title?: string | null
  teaser?: string | null
  body?: string | null
  visibility: Visibility
  requiredPlanId?: string | null
}

/**
 * Cria ou atualiza o post **e** o corpo, numa transação.
 *
 * O id continua nascendo no cliente: ele vem na URL de `/admin/posts/<id>`, e o anexo de
 * mídia acontece antes do "Salvar" — `postMedia.postId` é FK, então a linha do post
 * precisa existir antes do arquivo. `on conflict (id) do update` torna a criação
 * idempotente, o que o `createdRef` da tela existia para simular.
 *
 * 🔴 **A linha de `postContent` nasce sempre, mesmo vazia.** A ausência dela é o sinal de
 * "bloqueado" que a tela lê; post sem ela apareceria com paywall até para o criador.
 */
export async function savePost(
  viewer: Viewer,
  args: SavePostArgs,
): Promise<WriteResult<{ postId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()
  if (!args.id) return { ok: false, status: 400, code: 'missing-id', message: 'Falta o id.' }

  // plano exigido só faz sentido em post de assinante
  const requiredPlanId =
    args.visibility === 'subscribers' ? (args.requiredPlanId ?? null) : null

  const db = getDb()
  await db.transaction(async (tx) => {
    await tx
      .insert(post)
      .values({
        id: args.id,
        feedOwnerId: args.feedOwnerId,
        kind: args.kind,
        title: args.title ?? null,
        teaser: args.teaser ?? null,
        visibility: args.visibility,
        requiredPlanId,
        published: false,
        publishedAt: null,
        likeCount: 0,
        commentCount: 0,
        deleted: false,
        createdAt: nowIso(),
      })
      .onConflictDoUpdate({
        target: post.id,
        // publicação, contadores e datas ficam de fora: são estado, não formulário
        set: {
          kind: args.kind,
          title: args.title ?? null,
          teaser: args.teaser ?? null,
          visibility: args.visibility,
          requiredPlanId,
        },
      })

    await tx
      .insert(postContent)
      .values({ postId: args.id, body: args.body ?? null })
      .onConflictDoUpdate({
        target: postContent.postId,
        set: { body: args.body ?? null },
      })
  })

  return { ok: true, postId: args.id }
}

/**
 * Publicar e despublicar.
 *
 * ⚠️ `publishedAt` é carimbado com `coalesce`: o feed ordena e pagina por ele, e nulo
 * quebra a comparação de row value do cursor. Republicar não reescreve a data original.
 */
export async function setPostPublished(
  viewer: Viewer,
  args: { postId: string; published: boolean },
): Promise<WriteResult<{ postId: string; published: boolean }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  const [row] = await db
    .update(post)
    .set(
      args.published
        ? { published: true, publishedAt: sql`coalesce(${post.publishedAt}, now())` }
        : { published: false },
    )
    .where(eq(post.id, args.postId))
    .returning({ id: post.id })

  if (!row) return notFound()
  return { ok: true, postId: args.postId, published: args.published }
}

/** Soft delete — a linha fica, o feed para de mostrar. */
export async function deletePost(
  viewer: Viewer,
  args: { postId: string },
): Promise<WriteResult<{ postId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  const [row] = await db
    .update(post)
    .set({ deleted: true })
    .where(eq(post.id, args.postId))
    .returning({ id: post.id })

  if (!row) return notFound()
  return { ok: true, postId: args.postId }
}

/**
 * Anexa mídia ao post.
 *
 * `position` é calculada no servidor (`max + 1`), o que remove a corrida que a tela
 * tinha ao mandar `media.length` — dois anexos rápidos geravam a mesma posição.
 */
export async function attachMedia(
  viewer: Viewer,
  args: { postId: string; mediaId: string },
): Promise<WriteResult<{ postMediaId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  const id = crypto.randomUUID()

  const [row] = await db
    .insert(postMedia)
    .values({
      id,
      postId: args.postId,
      mediaId: args.mediaId,
      position: sql`(select coalesce(max("position"), -1) + 1 from "postMedia" where "postId" = ${args.postId})`,
    })
    // o índice único `(postId, mediaId)` faz anexar duas vezes virar no-op
    .onConflictDoNothing()
    .returning({ id: postMedia.id })

  if (row) return { ok: true, postMediaId: row.id }

  const [existing] = await db
    .select({ id: postMedia.id })
    .from(postMedia)
    .where(and(eq(postMedia.postId, args.postId), eq(postMedia.mediaId, args.mediaId)))
    .limit(1)

  return existing
    ? { ok: true, postMediaId: existing.id }
    : notFound('Não deu para anexar a mídia.')
}

/** Desanexa: apaga o vínculo, nunca a mídia. */
export async function detachMedia(
  viewer: Viewer,
  args: { postMediaId: string },
): Promise<WriteResult<{ postMediaId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  await db.delete(postMedia).where(eq(postMedia.id, args.postMediaId))
  return { ok: true, postMediaId: args.postMediaId }
}
