import { boolean, number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere, zql } from 'on-zero'

import { hasFullAccessToPost } from '~/data/where/canAccessContent'

import type { TableInsertRow } from 'on-zero'

export type Comment = TableInsertRow<typeof schema>

export type CommentIdArgs = { id: string }

export const schema = table('comment')
  .columns({
    id: string(),
    postId: string(),
    userId: string(),
    // um nível de thread: null = comentário raiz
    parentId: string().optional(),
    body: string(),
    deleted: boolean(),
    createdAt: number(),
  })
  .primaryKey('id')

// Cada um escreve e apaga só o próprio comentário — **e só em post a que tem direito**.
//
// 🔴 A segunda metade não é redundante, virou obrigatória na Fase 12. Antes, o post pago
// nem chegava a quem não assinava, então "não conseguir comentar" era efeito colateral do
// sync, não uma regra. Agora `canAccessPost` é frouxo de propósito (o card bloqueado
// precisa existir para converter), e sem este `exists` qualquer logado comentaria em post
// que não pode ler. **Permission de leitura ≠ permission de escrita** (invariante 9).
const canWrite = serverWhere('comment', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.and(
    _.cmp('userId', userId),
    _.exists('post', (q) => q.where((pq) => hasFullAccessToPost(pq, userId))),
  )
})

export const mutate = mutations(schema, canWrite, {
  /** Insere e sobe `post.commentCount` na mesma transação. */
  insert: async ({ tx, authData, can }, comment: Comment) => {
    if (!authData) throw new Error('Unauthorized')
    await can(canWrite, comment)
    await tx.mutate.comment.insert(comment)

    const post = await tx.run(zql.post.where('id', comment.postId).one())
    if (post) {
      await tx.mutate.post.update({
        id: post.id,
        commentCount: post.commentCount + 1,
      })
    }
  },

  /** Soft delete: a linha fica para não quebrar as respostas penduradas nela. */
  softDelete: async ({ tx, authData, can }, args: CommentIdArgs) => {
    if (!authData) throw new Error('Unauthorized')
    await can(canWrite, args.id)

    const comment = await tx.run(zql.comment.where('id', args.id).one())
    if (!comment || comment.deleted) return

    await tx.mutate.comment.update({ id: args.id, deleted: true })

    const post = await tx.run(zql.post.where('id', comment.postId).one())
    if (post) {
      await tx.mutate.post.update({
        id: post.id,
        commentCount: Math.max(0, post.commentCount - 1),
      })
    }
  },
})
