import { zql } from 'on-zero'

import { ACTIVE_SUBSCRIPTION_STATUSES } from '~/constants/creator'
import { canAccessOwnSubscription, canAccessPlan } from '~/data/where/canAccessContent'

const ACTIVE = [...ACTIVE_SUBSCRIPTION_STATUSES]

/** Tabela de preços. */
export const activePlans = () => {
  return zql.plan.where(canAccessPlan).where('active', true).orderBy('order', 'asc')
}

/**
 * Assinatura do usuário a um criador. Pode existir mais de uma linha por par
 * (uma cancelada e uma nova), por isso a ordenação por `createdAt`: a última vale.
 */
export const mySubscriptions = (props: { userId: string; creatorId: string }) => {
  return zql.subscription
    .where(canAccessOwnSubscription)
    .where('userId', props.userId)
    .where('creatorId', props.creatorId)
    .orderBy('createdAt', 'desc')
    .related('plan', (q) => q.one())
}

/**
 * A assinatura que está valendo agora, se houver.
 *
 * Filtra por `status`, nunca por `currentPeriodEnd > agora`: comparação com "agora"
 * dentro de query sincronizada muda de resultado entre cliente e servidor. Quem vira
 * `active` → `expired` é o job da Fase 9.
 */
export const activeSubscription = (props: { userId: string; creatorId: string }) => {
  return zql.subscription
    .where(canAccessOwnSubscription)
    .where('userId', props.userId)
    .where('creatorId', props.creatorId)
    .where('status', 'IN', ACTIVE)
    .orderBy('createdAt', 'desc')
    .one()
    .related('plan', (q) => q.one())
}
