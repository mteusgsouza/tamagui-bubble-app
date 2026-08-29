import { boolean, number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere, zql } from 'on-zero'

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

// Cada um escreve e apaga só o próprio comentário. O dono do feed modera pelo admin
// (role admin passa por cima via `defaultAllowAdminRole`).
const canWrite = serverWhere('comment', (_, auth) => {
  if (!auth?.id) return false
  return _.cmp('userId', auth.id)
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
