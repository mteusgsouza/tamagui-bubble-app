import { boolean, enumeration, number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type PostKind = 'text' | 'photo' | 'video' | 'audio'
export type Visibility = 'public' | 'subscribers'

export type Post = TableInsertRow<typeof schema>

export type PostIdArgs = { id: string }
export type PublishPostArgs = { id: string; publishedAt: number }

export const schema = table('post')
  .columns({
    id: string(),
    // dono do feed: é por esta coluna que o paywall junta post → subscription
    feedOwnerId: string(),
    kind: enumeration<PostKind>(),
    title: string().optional(),
    body: string().optional(),
    visibility: enumeration<Visibility>(),
    requiredPlanId: string().optional(),
    published: boolean(),
    publishedAt: number().optional(),
    // contadores denormalizados — quem mantém são as mutations de reaction e comment
    likeCount: number(),
    commentCount: number(),
    deleted: boolean(),
    createdAt: number(),
  })
  .primaryKey('id')

const canWrite = serverWhere('post', (_, auth) => {
  if (!auth?.id) return false
  return _.cmp('feedOwnerId', auth.id)
})

export const mutate = mutations(schema, canWrite, {
  /**
   * Soft delete. A linha continua no banco (comentários e reações penduram nela), mas
   * `postGate` filtra `deleted` no servidor, então ela some do sync de todo mundo
   * menos do dono do feed.
   */
  softDelete: async ({ tx, authData, can }, args: PostIdArgs) => {
    if (!authData) throw new Error('Unauthorized')
    await can(canWrite, args.id)
    await tx.mutate.post.update({ id: args.id, deleted: true })
  },

  /**
   * `publishedAt` vem do cliente, nunca de `Date.now()` aqui dentro: a mutation roda
   * duas vezes (otimista no cliente, autoritativa no servidor) e precisa dar o mesmo
   * resultado nas duas.
   */
  publish: async ({ tx, authData, can }, args: PublishPostArgs) => {
    if (!authData) throw new Error('Unauthorized')
    await can(canWrite, args.id)
    await tx.mutate.post.update({
      id: args.id,
      published: true,
      publishedAt: args.publishedAt,
    })
  },
})
