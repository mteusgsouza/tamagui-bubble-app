import { number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type CourseModule = TableInsertRow<typeof schema>

export const schema = table('courseModule')
  .columns({
    id: string(),
    courseId: string(),
    title: string(),
    order: number(),
  })
  .primaryKey('id')

const canWrite = serverWhere('courseModule', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('course', (q) => q.where('feedOwnerId', userId))
})

export const mutate = mutations(schema, canWrite)
