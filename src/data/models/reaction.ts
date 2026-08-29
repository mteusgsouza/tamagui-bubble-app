import { number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere, zql } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type Reaction = TableInsertRow<typeof schema>

export type ToggleReactionArgs = {
  /** gerado no cliente com `newId()` — usado só se a reação ainda não existe */
  id: string
  postId: string
  userId: string
  type: string
  createdAt: number
}

export const schema = table('reaction')
  .columns({
    id: string(),
    postId: string(),
    userId: string(),
    // hoje só 'like'. A coluna existe para caber emoji depois sem migration.
    type: string(),
    createdAt: number(),
  })
  .primaryKey('id')

const canWrite = serverWhere('reaction', (_, auth) => {
  if (!auth?.id) return false
  return _.cmp('userId', auth.id)
})

export const mutate = mutations(schema, canWrite, {
  /**
   * Curtir é toggle, não insert.
   *
   * Existe o índice único `reaction_postId_userId_type_uidx`: insert cego na segunda
   * curtida estoura no Postgres. Então a mutation procura antes — se achou, apaga e
   * desconta; se não achou, insere com o `id` que o **cliente** gerou (`newId()`) e
   * soma. Nada de id ou timestamp nascendo aqui dentro: a mutation roda no cliente e
   * no servidor e as duas execuções têm que convergir.
   */
  toggle: async ({ tx, authData, can }, args: ToggleReactionArgs) => {
    if (!authData) throw new Error('Unauthorized')
    await can(canWrite, args)

    const existing = await tx.run(
      zql.reaction
        .where('postId', args.postId)
        .where('userId', args.userId)
        .where('type', args.type)
        .one(),
    )

    const post = await tx.run(zql.post.where('id', args.postId).one())

    if (existing) {
      await tx.mutate.reaction.delete({ id: existing.id })
      if (post) {
        await tx.mutate.post.update({
          id: post.id,
          likeCount: Math.max(0, post.likeCount - 1),
        })
      }
      return
    }

    await tx.mutate.reaction.insert({
      id: args.id,
      postId: args.postId,
      userId: args.userId,
      type: args.type,
      createdAt: args.createdAt,
    })
    if (post) {
      await tx.mutate.post.update({ id: post.id, likeCount: post.likeCount + 1 })
    }
  },
})
