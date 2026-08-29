import { number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type PostMedia = TableInsertRow<typeof schema>

export const schema = table('postMedia')
  .columns({
    id: string(),
    postId: string(),
    mediaId: string(),
    // ordem no carrossel. índice único `(postId, mediaId)`: a mesma mídia não entra
    // duas vezes no mesmo post
    position: number(),
  })
  .primaryKey('id')

const canWrite = serverWhere('postMedia', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('post', (q) => q.where('feedOwnerId', userId))
})

export const mutate = mutations(schema, canWrite)
