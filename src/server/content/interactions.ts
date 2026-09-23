// O que o leitor escreve: curtida, comentário e progresso de aula.
//
// Três decisões que mudam em relação às mutations do Zero, e cada uma existe por um
// motivo que o modelo antigo não tinha como resolver.

import { and, eq, sql } from 'drizzle-orm'

import { getDb } from '~/database'
import {
  comment,
  course,
  lesson,
  lessonProgress,
  post,
  reaction,
} from '~/database/schema-public'
import { courseAccess, lessonAccess, postAccess } from '~/server/access/contentAccess'
import { nowIso, toEpoch } from '~/server/api/serialize'

import type { CommentDTO } from './dto'
import type { Viewer } from '~/server/access/viewer'

export type WriteResult<T> =
  | ({ ok: true } & T)
  | { ok: false; status: number; code: string; message: string }

const denied = (code: string, message: string) =>
  ({ ok: false as const, status: 403, code, message })

const notFound = (message: string) =>
  ({ ok: false as const, status: 404, code: 'not-found', message })

/**
 * Carrega o post e decide se este visitante pode escrever nele.
 *
 * 🔴 **Ler o card ≠ poder escrever.** Desde a Fase 12 o post pago chega a todo mundo
 * como vitrine; sem esta checagem qualquer logado comentaria e curtiria post que não
 * pode ler. Antes a proteção era acidental — a linha nem chegava. É a invariante 9.
 */
async function postForWriting(viewer: Viewer, postId: string) {
  const db = getDb()
  const [row] = await db.select().from(post).where(eq(post.id, postId)).limit(1)
  if (!row) return { row: null, access: null }
  return { row, access: postAccess(viewer, row) }
}

/**
 * `commentCount` é **recontado**, e é a escolha certa aqui: o número tem que bater com a
 * lista que a tela mostra. Post anunciando "6 comentários" sobre uma lista que responde
 * "Ninguém comentou ainda" foi o que apareceu na primeira ida a produção — por isso o
 * seed nem semeia este contador. Recontar é auto-corretivo e mata a divergência.
 */
const commentCountSql = (postId: string) =>
  sql`(select count(*)::int from ${comment} where ${comment.postId} = ${postId} and ${comment.deleted} = false)`

/**
 * 🔴 `likeCount` é **somado**, não recontado — e a diferença em relação ao comentário é
 * deliberada.
 *
 * O seed semeia curtidas de vitrine (`p-funil` nasce com 342) e isso é sustentável
 * porque nenhuma tela lista quem curtiu: o número sozinho não se contradiz. Recontar
 * derrubaria 342 para 1 no instante em que a primeira pessoa curtisse — foi exatamente
 * o que aconteceu no primeiro teste desta rota.
 *
 * Somar **em SQL** não tem a corrida que a mutation do Zero tinha: lá era
 * ler-modificar-escrever em duas idas, e duas curtidas simultâneas liam o mesmo valor.
 * Aqui o Postgres resolve a soma, e o ajuste só acontece quando uma linha realmente
 * mudou — por isso o `returning` abaixo.
 */
const bumpLikeSql = (by: 1 | -1) =>
  by === 1 ? sql`${post.likeCount} + 1` : sql`greatest(0, ${post.likeCount} - 1)`

// ---------------------------------------------------------------------------
// Curtida
// ---------------------------------------------------------------------------

/**
 * Curtir e descurtir, por **estado desejado** — `liked: true|false`, nunca "inverta".
 *
 * 🔴 Toggle não é idempotente. Duplo-toque, retry de rede e o retry do React Query
 * convergem para estados diferentes: dois toggles voltam ao começo, três invertem. Com
 * estado desejado qualquer repetição converge, e o corpo passa a dizer exatamente o que
 * a UI otimista já pintou na tela.
 *
 * O contador é **recontado**, não incrementado. Ler-modificar-escrever era o que as
 * mutations do Zero faziam e corre: duas curtidas simultâneas liam o mesmo valor.
 * Recontar dentro da transação torna a divergência impossível por construção, e com o
 * índice `reaction_postId_userId_type_uidx` o custo é irrelevante num app de um criador.
 */
export async function setReaction(
  viewer: Viewer,
  args: { postId: string; liked: boolean },
): Promise<WriteResult<{ postId: string; liked: boolean; likeCount: number }>> {
  const { row, access } = await postForWriting(viewer, args.postId)
  if (!row || !access) return notFound('Post indisponível.')
  if (!access.allowed) return denied(access.reason, 'Assine para interagir com este post.')

  const db = getDb()
  const likeCount = await db.transaction(async (tx) => {
    // 🔴 `returning` é o que torna a rota idempotente: o índice único
    // `reaction_postId_userId_type_uidx` faz a segunda curtida virar no-op, e sem saber
    // se alguma linha mudou o contador subiria a cada toque repetido.
    const changed = args.liked
      ? await tx
          .insert(reaction)
          .values({
            id: crypto.randomUUID(),
            postId: args.postId,
            userId: viewer.id,
            type: 'like',
            createdAt: nowIso(),
          })
          .onConflictDoNothing()
          .returning({ id: reaction.id })
      : await tx
          .delete(reaction)
          .where(
            and(
              eq(reaction.postId, args.postId),
              eq(reaction.userId, viewer.id),
              eq(reaction.type, 'like'),
            ),
          )
          .returning({ id: reaction.id })

    if (!changed.length) return row.likeCount

    const [updated] = await tx
      .update(post)
      .set({ likeCount: bumpLikeSql(args.liked ? 1 : -1) })
      .where(eq(post.id, args.postId))
      .returning({ likeCount: post.likeCount })

    return updated?.likeCount ?? row.likeCount
  })

  return { ok: true, postId: args.postId, liked: args.liked, likeCount }
}

// ---------------------------------------------------------------------------
// Comentário
// ---------------------------------------------------------------------------

const MAX_COMMENT = 2000

export async function createComment(
  viewer: Viewer,
  args: { postId: string; body: string; parentId?: string | null },
): Promise<WriteResult<{ comment: CommentDTO; commentCount: number }>> {
  const body = args.body.trim()
  if (!body) {
    return { ok: false, status: 400, code: 'empty-body', message: 'Escreva algo antes de enviar.' }
  }
  if (body.length > MAX_COMMENT) {
    return {
      ok: false,
      status: 422,
      code: 'body-too-long',
      message: `Comentário passa de ${MAX_COMMENT} caracteres.`,
    }
  }

  const { row, access } = await postForWriting(viewer, args.postId)
  if (!row || !access) return notFound('Post indisponível.')
  if (!access.allowed) return denied(access.reason, 'Assine para comentar neste post.')

  const db = getDb()
  const id = crypto.randomUUID()
  const createdAt = nowIso()

  const commentCount = await db.transaction(async (tx) => {
    // 🔴 o pai tem que ser do mesmo post: sem isto dá para pendurar resposta em
    // comentário de outro post e vazar contexto entre threads
    let parentId: string | null = null
    if (args.parentId) {
      const [parent] = await tx
        .select({ id: comment.id })
        .from(comment)
        .where(and(eq(comment.id, args.parentId), eq(comment.postId, args.postId)))
        .limit(1)
      parentId = parent?.id ?? null
    }

    await tx.insert(comment).values({
      id,
      postId: args.postId,
      userId: viewer.id,
      parentId,
      body,
      deleted: false,
      createdAt,
    })

    const [updated] = await tx
      .update(post)
      .set({ commentCount: commentCountSql(args.postId) })
      .where(eq(post.id, args.postId))
      .returning({ commentCount: post.commentCount })

    return updated?.commentCount ?? 0
  })

  return {
    ok: true,
    commentCount,
    comment: {
      id,
      userId: viewer.id,
      body,
      createdAt: toEpoch(createdAt),
      deleted: false,
      parentId: args.parentId ?? null,
      user: null,
      replies: [],
    },
  }
}

/**
 * Soft delete: a linha fica para não quebrar as respostas penduradas nela.
 *
 * Cada um apaga o que é seu; admin e dono do feed apagam qualquer um — era o que o
 * `defaultAllowAdminRole: 'all'` dava de graça no Zero e aqui precisa ser explícito.
 */
export async function deleteComment(
  viewer: Viewer,
  args: { commentId: string },
): Promise<WriteResult<{ commentId: string; commentCount: number }>> {
  const db = getDb()

  const [row] = await db
    .select({ comment, feedOwnerId: post.feedOwnerId })
    .from(comment)
    .innerJoin(post, eq(post.id, comment.postId))
    .where(eq(comment.id, args.commentId))
    .limit(1)

  if (!row) return notFound('Comentário não encontrado.')

  const mine = row.comment.userId === viewer.id
  if (!mine && !viewer.isAdmin && row.feedOwnerId !== viewer.id) {
    return denied('forbidden', 'Você só apaga os próprios comentários.')
  }

  if (row.comment.deleted) {
    // já apagado: idempotente, devolve o contador atual sem escrever
    const [current] = await db
      .select({ commentCount: post.commentCount })
      .from(post)
      .where(eq(post.id, row.comment.postId))
      .limit(1)
    return { ok: true, commentId: args.commentId, commentCount: current?.commentCount ?? 0 }
  }

  const postId = row.comment.postId
  const commentCount = await db.transaction(async (tx) => {
    await tx.update(comment).set({ deleted: true }).where(eq(comment.id, args.commentId))

    const [updated] = await tx
      .update(post)
      .set({ commentCount: commentCountSql(postId) })
      .where(eq(post.id, postId))
      .returning({ commentCount: post.commentCount })

    return updated?.commentCount ?? 0
  })

  return { ok: true, commentId: args.commentId, commentCount }
}

// ---------------------------------------------------------------------------
// Progresso de aula
// ---------------------------------------------------------------------------

/**
 * Upsert por `(userId, lessonId)` — naturalmente idempotente, que é o que o player
 * precisa: ele salva a cada 10 s e no unmount.
 *
 * ⚠️ `coalesce` no `completedAt`: **aula concluída não volta a pendente** porque o
 * usuário reassistiu o começo. Era o `args.completedAt ?? existing.completedAt` da
 * mutation antiga, agora resolvido pelo Postgres numa ida só.
 */
export async function saveProgress(
  viewer: Viewer,
  args: { lessonId: string; positionSec: number; completed?: boolean },
): Promise<WriteResult<{ lessonId: string; positionSec: number; completedAt: number | null }>> {
  const db = getDb()

  const [row] = await db
    .select({ lesson, course })
    .from(lesson)
    .innerJoin(course, eq(course.id, lesson.courseId))
    .where(eq(lesson.id, args.lessonId))
    .limit(1)

  if (!row) return notFound('Aula não encontrada.')

  const access = lessonAccess(viewer, row.lesson, row.course)
  if (!access.allowed) {
    // o curso é quem dita o motivo — a aula não tem tier próprio
    const reason = courseAccess(viewer, row.course)
    return denied(
      reason.allowed ? 'forbidden' : reason.reason,
      'Assine para acompanhar este curso.',
    )
  }

  const positionSec = Math.max(0, Math.floor(args.positionSec))
  const now = nowIso()

  const [saved] = await db
    .insert(lessonProgress)
    .values({
      id: crypto.randomUUID(),
      userId: viewer.id,
      lessonId: args.lessonId,
      positionSec,
      completedAt: args.completed ? now : null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [lessonProgress.userId, lessonProgress.lessonId],
      set: {
        positionSec: sql`excluded."positionSec"`,
        updatedAt: sql`excluded."updatedAt"`,
        completedAt: sql`coalesce(${lessonProgress.completedAt}, excluded."completedAt")`,
      },
    })
    .returning({ positionSec: lessonProgress.positionSec, completedAt: lessonProgress.completedAt })

  return {
    ok: true,
    lessonId: args.lessonId,
    positionSec: saved?.positionSec ?? positionSec,
    completedAt: toEpoch(saved?.completedAt),
  }
}
