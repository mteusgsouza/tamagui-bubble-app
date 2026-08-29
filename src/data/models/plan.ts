import { boolean, enumeration, number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type Plan = TableInsertRow<typeof schema>

export const schema = table('plan')
  .columns({
    id: string(),
    slug: string(),
    name: string(),
    priceCents: number(),
    currency: string(),
    interval: enumeration<'month' | 'year'>(),
    active: boolean(),
    order: number(),
  })
  .primaryKey('id')

// Só admin cria ou muda plano. O `false` aqui vale para todo mundo que não é admin —
// `defaultAllowAdminRole: 'all'` em `src/zero/server.ts` deixa o admin passar.
const canWrite = serverWhere('plan', () => false)

export const mutate = mutations(schema, canWrite)
