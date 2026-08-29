import { number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere, zql } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type LessonProgress = TableInsertRow<typeof schema>

export type SaveProgressArgs = {
  /** gerado no cliente com `newId()` — usado só na primeira vez */
  id: string
  userId: string
  lessonId: string
  positionSec: number
  updatedAt: number
  completedAt?: number
}

export const schema = table('lessonProgress')
  .columns({
    id: string(),
    userId: string(),
    lessonId: string(),
    positionSec: number(),
    completedAt: number().optional(),
    updatedAt: number(),
  })
  .primaryKey('id')

const canWrite = serverWhere('lessonProgress', (_, auth) => {
  if (!auth?.id) return false
  return _.cmp('userId', auth.id)
})

export const mutate = mutations(schema, canWrite, {
  /**
   * Upsert por `(userId, lessonId)` — é o índice único da tabela, então insert cego
   * na segunda vez que o player salva a posição estoura.
   *
   * `id`, `updatedAt` e `completedAt` vêm do cliente. Chamar `Date.now()` aqui dentro
   * quebraria a convergência.
   */
  save: async ({ tx, authData, can }, args: SaveProgressArgs) => {
    if (!authData) throw new Error('Unauthorized')
    await can(canWrite, args)

    const existing = await tx.run(
      zql.lessonProgress
        .where('userId', args.userId)
        .where('lessonId', args.lessonId)
        .one(),
    )

    if (existing) {
      await tx.mutate.lessonProgress.update({
        id: existing.id,
        positionSec: args.positionSec,
        updatedAt: args.updatedAt,
        // uma aula concluída não volta a ficar pendente por causa de um replay
        completedAt: args.completedAt ?? existing.completedAt,
      })
      return
    }

    await tx.mutate.lessonProgress.insert({
      id: args.id,
      userId: args.userId,
      lessonId: args.lessonId,
      positionSec: args.positionSec,
      updatedAt: args.updatedAt,
      completedAt: args.completedAt,
    })
  },
})
