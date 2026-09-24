// O feed e o post, montados no servidor.
//
// 🔴 **Orçamento fixo de queries.** Uma página de 20 posts custa 6 consultas, e custaria
// 6 com 200 posts. A regra é: busca os pais, `inArray` para cada coleção filha, costura
// com `Map` em JS. Query dentro de laço aqui é regressão — foi o N+1 do sync que esta
// migração veio resolver.
//
// O tier nunca entra no SQL. O `Viewer` já chegou com as assinaturas em dois `Set`, e
// `feedOwnerId`/`requiredPlanId` já estão na linha do post — decidir é comparação em
// memória. Era esse `EXISTS` correlacionado por linha que o Zero disparava.

import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'

import { getDb } from '~/database'
import {
  comment,
  media,
  post,
  postContent,
  postMedia,
  reaction,
  userPublic,
} from '~/database/schema-public'
import { postAccess } from '~/server/access/contentAccess'
import { toEpoch } from '~/server/api/serialize'

import type { AuthorDTO, CommentDTO, FeedPageDTO, MediaDTO, PostDTO, PostMediaDTO } from './dto'
import type { Viewer } from '~/server/access/viewer'

/** Quantos comentários o card do feed mostra. Igual ao `.limit(3)` da query do Zero. */
const FEED_COMMENTS = 3
/** Teto do detalhe. O Zero usava 100; 200 dá folga sem abrir espaço para abuso. */
const DETAIL_COMMENTS = 200

type PostRow = typeof post.$inferSelect

type AuthorColumns = {
  authorId: string | null
  authorName: string | null
  authorUsername: string | null
  authorImage: string | null
}

const AUTHOR_COLUMNS = {
  authorId: userPublic.id,
  authorName: userPublic.name,
  authorUsername: userPublic.username,
  authorImage: userPublic.image,
}

const toAuthor = (row: AuthorColumns): AuthorDTO | null =>
  row.authorId
    ? {
        id: row.authorId,
        name: row.authorName,
        username: row.authorUsername,
        image: row.authorImage,
      }
    : null

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

/**
 * Cursor keyset opaco: o `publishedAt` cru do banco mais o id, que desempata.
 *
 * Opaco de propósito — o cliente não constrói cursor, só devolve o que recebeu. Guarda a
 * string crua em vez do epoch para a comparação no Postgres ser exata, sem ida e volta
 * de fuso.
 */
const encodeCursor = (publishedAt: string | null, id: string) =>
  Buffer.from(`${publishedAt ?? ''}\u0000${id}`, 'utf8').toString('base64url')

const decodeCursor = (cursor: string): { publishedAt: string; id: string } | null => {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8')
    const [publishedAt, id] = raw.split('\u0000')
    return publishedAt && id ? { publishedAt, id } : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Coleções filhas
// ---------------------------------------------------------------------------

/** O corpo, só dos posts liberados. É aqui que o paywall acontece de fato. */
async function loadBodies(ids: string[]) {
  const bodies = new Map<string, string | null>()
  if (!ids.length) return bodies

  const db = getDb()
  const rows = await db
    .select({ postId: postContent.postId, body: postContent.body })
    .from(postContent)
    .where(inArray(postContent.postId, ids))

  for (const row of rows) bodies.set(row.postId, row.body)
  return bodies
}

async function loadMedia(ids: string[]) {
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

/**
 * Os `FEED_COMMENTS` mais recentes **de cada post**, numa query só.
 *
 * ⚠️ `row_number()` e não "busca tudo e fatia em JS": um post com 500 comentários
 * derrubaria a página inteira do feed.
 */
async function loadFeedComments(ids: string[]) {
  const byPost = new Map<string, CommentDTO[]>()
  if (!ids.length) return byPost

  const db = getDb()
  const ranked = db.$with('ranked').as(
    db
      .select({
        id: comment.id,
        postId: comment.postId,
        userId: comment.userId,
        body: comment.body,
        deleted: comment.deleted,
        parentId: comment.parentId,
        createdAt: comment.createdAt,
        rn: sql<number>`row_number() over (partition by ${comment.postId} order by ${comment.createdAt} desc)`.as(
          'rn',
        ),
      })
      .from(comment)
      .where(and(inArray(comment.postId, ids), eq(comment.deleted, false))),
  )

  const rows = await db
    .with(ranked)
    .select({
      id: ranked.id,
      postId: ranked.postId,
      userId: ranked.userId,
      body: ranked.body,
      deleted: ranked.deleted,
      parentId: ranked.parentId,
      createdAt: ranked.createdAt,
      ...AUTHOR_COLUMNS,
    })
    .from(ranked)
    .leftJoin(userPublic, eq(userPublic.id, ranked.userId))
    .where(lte(ranked.rn, FEED_COMMENTS))
    .orderBy(ranked.postId, desc(ranked.createdAt))

  for (const row of rows) {
    const list = byPost.get(row.postId) ?? []
    list.push({
      id: row.id,
      userId: row.userId,
      body: row.body,
      createdAt: toEpoch(row.createdAt),
      deleted: row.deleted,
      parentId: row.parentId,
      user: toAuthor(row),
    })
    byPost.set(row.postId, list)
  }
  return byPost
}

/** Quais destes posts o visitante curtiu. Uma query, vira `Set`. */
async function loadLiked(ids: string[], userId: string) {
  if (!ids.length || !userId) return new Set<string>()

  const db = getDb()
  const rows = await db
    .select({ postId: reaction.postId })
    .from(reaction)
    .where(
      and(
        inArray(reaction.postId, ids),
        eq(reaction.userId, userId),
        eq(reaction.type, 'like'),
      ),
    )
  return new Set(rows.map((row) => row.postId))
}

// ---------------------------------------------------------------------------
// Montagem
// ---------------------------------------------------------------------------

type PostParts = {
  body: string | null | undefined
  hasBody: boolean
  media: PostMediaDTO[]
  comments: CommentDTO[]
  liked: boolean
}

function buildPost(
  row: PostRow,
  author: AuthorDTO | null,
  viewer: Viewer,
  parts: PostParts,
): PostDTO {
  const access = postAccess(viewer, row)

  return {
    id: row.id,
    feedOwnerId: row.feedOwnerId,
    kind: row.kind,
    title: row.title,
    teaser: row.teaser,
    visibility: row.visibility,
    requiredPlanId: row.requiredPlanId,
    publishedAt: toEpoch(row.publishedAt),
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    feedOwner: author,
    // 🔴 bloqueado não leva corpo, mídia nem comentário — nada de produto atravessa
    content: access.allowed && parts.hasBody ? { body: parts.body ?? null } : null,
    locked: !access.allowed,
    lockReason: access.allowed ? null : access.reason,
    media: access.allowed ? parts.media : [],
    comments: access.allowed ? parts.comments : [],
    liked: parts.liked,
  }
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

export async function loadFeedPage(
  viewer: Viewer,
  options: { feedOwnerId: string; limit: number; cursor?: string | null },
): Promise<FeedPageDTO> {
  const db = getDb()
  const cursor = options.cursor ? decodeCursor(options.cursor) : null

  // pede um a mais: se vier, existe próxima página — sem uma segunda query de contagem
  const rows = await db
    .select({ post, ...AUTHOR_COLUMNS })
    .from(post)
    .leftJoin(userPublic, eq(userPublic.id, post.feedOwnerId))
    .where(
      and(
        eq(post.feedOwnerId, options.feedOwnerId),
        eq(post.published, true),
        eq(post.deleted, false),
        cursor
          ? sql`(${post.publishedAt}, ${post.id}) < (${cursor.publishedAt}, ${cursor.id})`
          : undefined,
      ),
    )
    .orderBy(desc(post.publishedAt), desc(post.id))
    .limit(options.limit + 1)

  const hasMore = rows.length > options.limit
  const page = hasMore ? rows.slice(0, options.limit) : rows

  // a partição acontece em JS, sem tocar o banco
  const unlockedIds = page
    .filter((row) => postAccess(viewer, row.post).allowed)
    .map((row) => row.post.id)
  const allIds = page.map((row) => row.post.id)

  const [bodies, mediaByPost, commentsByPost, liked] = await Promise.all([
    loadBodies(unlockedIds),
    loadMedia(unlockedIds),
    loadFeedComments(unlockedIds),
    loadLiked(allIds, viewer.id),
  ])

  const posts = page.map((row) =>
    buildPost(row.post, toAuthor(row), viewer, {
      body: bodies.get(row.post.id),
      hasBody: bodies.has(row.post.id),
      media: mediaByPost.get(row.post.id) ?? [],
      comments: commentsByPost.get(row.post.id) ?? [],
      liked: liked.has(row.post.id),
    }),
  )

  const last = page.at(-1)
  return {
    posts,
    nextCursor: hasMore && last ? encodeCursor(last.post.publishedAt, last.post.id) : null,
  }
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

/**
 * Um post, com a árvore de comentários.
 *
 * Devolve `null` quando o post não existe **ou** quando não existe para este visitante
 * (rascunho alheio, apagado). A tela não distingue os dois de propósito: "Post
 * indisponível" não revela que o rascunho existe.
 */
export async function loadPostDetail(
  viewer: Viewer,
  postId: string,
): Promise<PostDTO | null> {
  const db = getDb()

  const [row] = await db
    .select({ post, ...AUTHOR_COLUMNS })
    .from(post)
    .leftJoin(userPublic, eq(userPublic.id, post.feedOwnerId))
    .where(eq(post.id, postId))
    .limit(1)

  if (!row) return null

  const visible =
    viewer.isAdmin ||
    row.post.feedOwnerId === viewer.id ||
    (row.post.published && !row.post.deleted)
  if (!visible) return null

  const allowed = postAccess(viewer, row.post).allowed
  const ids = allowed ? [postId] : []

  const [bodies, mediaByPost, liked, flat] = await Promise.all([
    loadBodies(ids),
    loadMedia(ids),
    loadLiked([postId], viewer.id),
    allowed ? loadAllComments(postId) : Promise.resolve([]),
  ])

  return buildPost(row.post, toAuthor(row), viewer, {
    body: bodies.get(postId),
    hasBody: bodies.has(postId),
    media: mediaByPost.get(postId) ?? [],
    comments: nestComments(flat),
    liked: liked.has(postId),
  })
}

/** Todos os comentários de um post. Sem window function — é um post só. */
async function loadAllComments(postId: string): Promise<CommentDTO[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: comment.id,
      userId: comment.userId,
      body: comment.body,
      deleted: comment.deleted,
      parentId: comment.parentId,
      createdAt: comment.createdAt,
      ...AUTHOR_COLUMNS,
    })
    .from(comment)
    .leftJoin(userPublic, eq(userPublic.id, comment.userId))
    .where(and(eq(comment.postId, postId), eq(comment.deleted, false)))
    .orderBy(comment.createdAt)
    .limit(DETAIL_COMMENTS)

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    body: row.body,
    createdAt: toEpoch(row.createdAt),
    deleted: row.deleted,
    parentId: row.parentId,
    user: toAuthor(row),
  }))
}

/**
 * Raízes com suas respostas, em JS.
 *
 * ⚠️ Resposta cujo pai foi apagado vira raiz, em vez de sumir. Some o contexto, mas o
 * texto continua na tela — que é o que o Zero fazia, porque a relação `replies` de um
 * pai apagado simplesmente não chegava.
 */
function nestComments(flat: CommentDTO[]): CommentDTO[] {
  const roots: CommentDTO[] = []
  const byId = new Map(flat.map((row) => [row.id, row]))

  for (const row of flat) {
    const parent = row.parentId ? byId.get(row.parentId) : undefined
    if (parent) {
      parent.replies = parent.replies ?? []
      parent.replies.push(row)
    } else {
      roots.push(row)
    }
  }

  // o feed mostra o mais recente primeiro; a conversa dentro de um comentário é cronológica
  return roots.reverse()
}
