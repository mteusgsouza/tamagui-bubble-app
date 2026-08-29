import { boolean, enumeration, number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { Visibility } from './post'
import type { TableInsertRow } from 'on-zero'

export type Course = TableInsertRow<typeof schema>

export const schema = table('course')
  .columns({
    id: string(),
    feedOwnerId: string(),
    slug: string(),
    title: string(),
    description: string().optional(),
    coverMediaId: string().optional(),
    visibility: enumeration<Visibility>(),
    requiredPlanId: string().optional(),
    published: boolean(),
    order: number(),
    createdAt: number(),
  })
  .primaryKey('id')

const canWrite = serverWhere('course', (_, auth) => {
  if (!auth?.id) return false
  return _.cmp('feedOwnerId', auth.id)
})

export const mutate = mutations(schema, canWrite)
