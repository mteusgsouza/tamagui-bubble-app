import { enumeration, number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type MediaKind = 'photo' | 'video' | 'audio'
export type MediaStatus = 'pending' | 'ready' | 'failed'

export type Media = TableInsertRow<typeof schema>

export const schema = table('media')
  .columns({
    id: string(),
    ownerId: string(),
    provider: enumeration<'r2'>(),
    storageKey: string(),
    // frame ou capa de vídeo/áudio, subido como objeto próprio
    posterKey: string().optional(),
    mime: string(),
    kind: enumeration<MediaKind>(),
    sizeBytes: number(),
    durationSec: number().optional(),
    width: number().optional(),
    height: number().optional(),
    status: enumeration<MediaStatus>(),
    createdAt: number(),
  })
  .primaryKey('id')

const canWrite = serverWhere('media', (_, auth) => {
  if (!auth?.id) return false
  return _.cmp('ownerId', auth.id)
})

export const mutate = mutations(schema, canWrite)
