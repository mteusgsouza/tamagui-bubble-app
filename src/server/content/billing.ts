// Planos e a assinatura do visitante.
//
// `/api/me` é o bootstrap da sessão: `assinar.tsx` e `SubscriptionCard.tsx` perguntavam
// a mesma coisa por duas queries do Zero. Agora é uma chave de cache só.

import { and, asc, desc, eq, inArray } from 'drizzle-orm'

import { ACTIVE_SUBSCRIPTION_STATUSES, MASTER_USER_ID } from '~/constants/creator'
import { getDb } from '~/database'
import { plan, subscription } from '~/database/schema-public'
import { toEpoch } from '~/server/api/serialize'

import type { MeDTO, PlanDTO, SubscriptionDTO } from './dto'
import type { Viewer } from '~/server/access/viewer'

const ACTIVE = [...ACTIVE_SUBSCRIPTION_STATUSES]

type PlanRow = typeof plan.$inferSelect

const toPlan = (row: PlanRow): PlanDTO => ({
  id: row.id,
  slug: row.slug,
  name: row.name,
  priceCents: row.priceCents,
  currency: row.currency,
  interval: row.interval,
  accessDays: row.accessDays,
  active: row.active,
  order: row.order,
})

/**
 * A tabela de preços.
 *
 * `includeInactive` é o modo admin: plano fora de venda **nunca** é apagado (decisão 16
 * do `STATE` — assinatura vendida ainda aponta para ele), então o admin precisa vê-lo.
 */
export async function loadPlans(options: { includeInactive?: boolean } = {}) {
  const db = getDb()
  const rows = await db
    .select()
    .from(plan)
    .where(options.includeInactive ? undefined : eq(plan.active, true))
    .orderBy(asc(plan.order))
  return rows.map(toPlan)
}

/**
 * A assinatura ativa do visitante com o criador.
 *
 * ⚠️ Nunca compara `currentPeriodEnd` com "agora" — quem derruba assinatura vencida é o
 * cron (`/api/cron/expire-subscriptions`), e o gate olha só o status. Era assim no Zero
 * (por convergência) e continua sendo, mas agora por escolha: duas fontes de verdade
 * sobre "está ativa?" divergiriam.
 */
export async function loadActiveSubscription(
  userId: string,
  creatorId: string,
): Promise<SubscriptionDTO | null> {
  if (!userId || !creatorId) return null

  const db = getDb()
  const [row] = await db
    .select({ subscription, plan })
    .from(subscription)
    .leftJoin(plan, eq(plan.id, subscription.planId))
    .where(
      and(
        eq(subscription.userId, userId),
        eq(subscription.creatorId, creatorId),
        inArray(subscription.status, ACTIVE),
      ),
    )
    .orderBy(desc(subscription.createdAt))
    .limit(1)

  if (!row) return null

  return {
    id: row.subscription.id,
    planId: row.subscription.planId,
    creatorId: row.subscription.creatorId,
    status: row.subscription.status,
    currentPeriodEnd: toEpoch(row.subscription.currentPeriodEnd),
    cancelAtPeriodEnd: row.subscription.cancelAtPeriodEnd,
    plan: row.plan ? toPlan(row.plan) : null,
  }
}

/** Quem é o visitante e o que ele já comprou, numa resposta só. */
export async function loadMe(viewer: Viewer): Promise<MeDTO> {
  const subscriptionRow = await loadActiveSubscription(viewer.id, MASTER_USER_ID)

  return {
    user: { id: viewer.id, isAdmin: viewer.isAdmin },
    subscription: subscriptionRow,
    entitlement: {
      creators: [...viewer.creators],
      plans: [...viewer.plans],
    },
  }
}
