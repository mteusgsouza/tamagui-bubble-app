import { boolean, number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type Lesson = TableInsertRow<typeof schema>

export const schema = table('lesson')
  .columns({
    id: string(),
    courseId: string(),
    // null = aula solta no curso, fora de qualquer módulo
    moduleId: string().optional(),
    title: string(),
    body: string().optional(),
    // uma mídia só. Aula com vídeo + PDF não cabe aqui hoje — ver o handoff.
    mediaId: string().optional(),
    durationSec: number().optional(),
    order: number(),
    published: boolean(),
    // fura o paywall do curso: aula de amostra
    freePreview: boolean(),
    createdAt: number(),
  })
  .primaryKey('id')

const canWrite = serverWhere('lesson', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('course', (q) => q.where('feedOwnerId', userId))
})

export const mutate = mutations(schema, canWrite)
