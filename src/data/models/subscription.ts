import { boolean, enumeration, number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'

export type Subscription = TableInsertRow<typeof schema>

export const schema = table('subscription')
  .columns({
    id: string(),
    userId: string(),
    // criador cujo conteúdo a assinatura libera: a outra ponta do join do paywall
    creatorId: string(),
    planId: string(),
    provider: string(),
    providerSubscriptionId: string().optional(),
    status: enumeration<SubscriptionStatus>(),
    currentPeriodEnd: number().optional(),
    cancelAtPeriodEnd: boolean(),
    createdAt: number(),
    updatedAt: number(),
  })
  .primaryKey('id')

// Ninguém assina a si mesmo pelo cliente: quem concede acesso é o admin (MVP) ou o
// webhook do gateway (Fase 9), ambos server-side.
const canWrite = serverWhere('subscription', () => false)

export const mutate = mutations(schema, canWrite)
