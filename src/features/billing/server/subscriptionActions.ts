// As escritas de assinatura e pagamento, num lugar só.
//
// Três chamadores: o admin (`/api/admin/people`), o webhook do gateway
// (`/api/billing/webhook/[provider]`) e o job de expiração (`/api/cron/...`). Se cada um
// escrevesse do seu jeito, o gate da Fase 4 — que lê `subscription.status` — passaria a
// depender de qual caminho gravou por último.
//
// Server-only: usa Drizzle direto. `payment` é tabela privada, fora do Zero de propósito.

import { and, eq, inArray, lt, sql } from 'drizzle-orm'

import { ACTIVE_SUBSCRIPTION_STATUSES } from '~/constants/creator'
import { getDb } from '~/database'
import { payment, user } from '~/database/schema-private'
import { subscription, userPublic } from '~/database/schema-public'

import type { SubscriptionStatus } from '../types'

const ACTIVE = [...ACTIVE_SUBSCRIPTION_STATUSES]

const now = () => new Date().toISOString()

export type GrantResult =
  | { ok: true; subscriptionId: string; reused: boolean }
  | { ok: false; code: 'no-public-profile'; message: string }

/**
 * Concede (ou reativa) uma assinatura.
 *
 * **Uma assinatura por par (usuário, criador).** Criar uma segunda faria o join do
 * paywall achar duas linhas e o comportamento passaria a depender de qual delas o Zero
 * devolve primeiro.
 */
export async function grantSubscription({
  userId,
  creatorId,
  planId,
  provider = 'manual',
  providerSubscriptionId,
  status = 'active',
  currentPeriodEnd,
}: {
  userId: string
  creatorId: string
  planId: string
  provider?: string
  providerSubscriptionId?: string | null
  status?: SubscriptionStatus
  /** epoch ms */
  currentPeriodEnd?: number | null
}): Promise<GrantResult> {
  const db = getDb()

  // a FK de `subscription` aponta para `userPublic`, não para `user` — quem nunca abriu
  // o app não tem perfil público ainda
  const [pub] = await db
    .select({ id: userPublic.id })
    .from(userPublic)
    .where(eq(userPublic.id, userId))
    .limit(1)

  if (!pub) {
    return {
      ok: false,
      code: 'no-public-profile',
      message:
        'Esse usuário não tem perfil público ainda — ele precisa abrir o app uma vez.',
    }
  }

  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd).toISOString() : null

  const [existing] = await db
    .select({ id: subscription.id })
    .from(subscription)
    .where(and(eq(subscription.userId, userId), eq(subscription.creatorId, creatorId)))
    .limit(1)

  if (existing) {
    await db
      .update(subscription)
      .set({
        planId,
        status,
        provider,
        ...(providerSubscriptionId ? { providerSubscriptionId } : null),
        ...(periodEnd ? { currentPeriodEnd: periodEnd } : null),
        cancelAtPeriodEnd: false,
        updatedAt: now(),
      })
      .where(eq(subscription.id, existing.id))

    return { ok: true, subscriptionId: existing.id, reused: true }
  }

  const id = `sub-${crypto.randomUUID()}`
  await db.insert(subscription).values({
    id,
    userId,
    creatorId,
    planId,
    provider,
    providerSubscriptionId: providerSubscriptionId ?? null,
    status,
    currentPeriodEnd: periodEnd,
    createdAt: now(),
    updatedAt: now(),
  })

  return { ok: true, subscriptionId: id, reused: false }
}

/**
 * Cancela. **Marca `canceled`, não apaga** — o histórico importa para faturamento, e
 * `payment.subscriptionId` referencia a linha.
 */
export async function cancelSubscription(subscriptionId: string) {
  const db = getDb()
  await db
    .update(subscription)
    .set({ status: 'canceled', updatedAt: now() })
    .where(eq(subscription.id, subscriptionId))
}

/** Muda só o status — é o que o webhook faz em `past_due`, `active`, etc. */
export async function setSubscriptionStatus(
  subscriptionId: string,
  status: SubscriptionStatus,
  currentPeriodEnd?: number | null,
) {
  const db = getDb()
  await db
    .update(subscription)
    .set({
      status,
      ...(currentPeriodEnd
        ? { currentPeriodEnd: new Date(currentPeriodEnd).toISOString() }
        : null),
      updatedAt: now(),
    })
    .where(eq(subscription.id, subscriptionId))
}

/** Acha a nossa assinatura a partir do id do gateway. */
export async function findSubscription({
  subscriptionId,
  providerSubscriptionId,
}: {
  subscriptionId?: string
  providerSubscriptionId?: string
}) {
  const db = getDb()
  if (subscriptionId) {
    const [row] = await db
      .select()
      .from(subscription)
      .where(eq(subscription.id, subscriptionId))
      .limit(1)
    return row ?? null
  }
  if (providerSubscriptionId) {
    const [row] = await db
      .select()
      .from(subscription)
      .where(eq(subscription.providerSubscriptionId, providerSubscriptionId))
      .limit(1)
    return row ?? null
  }
  return null
}

/**
 * Registra um pagamento.
 *
 * **Idempotente por `providerPaymentId`**: gateway reenvia webhook, e sem isso o
 * faturamento contaria o mesmo pagamento duas vezes.
 *
 * Devolve `skipped: 'unknown-user'` quando o dono não existe, em vez de deixar a FK
 * estourar — ver o comentário dentro.
 */
export type RecordPaymentResult =
  | { recorded: true; duplicate: false }
  | { recorded: false; duplicate: true }
  | { recorded: false; duplicate: false; skipped: 'unknown-user' }

export async function recordPayment({
  userId,
  subscriptionId,
  provider,
  providerPaymentId,
  amountCents,
  currency = 'BRL',
  paidAt,
}: {
  userId: string
  subscriptionId?: string | null
  provider: string
  providerPaymentId: string
  amountCents: number
  currency?: string
  /** epoch ms */
  paidAt?: number
}): Promise<RecordPaymentResult> {
  const db = getDb()

  // `payment.userId` tem FK para `user`: um id que o gateway mandou errado viraria
  // erro 500 no webhook, e gateway que recebe 500 reenvia o mesmo evento para sempre
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  if (!owner) return { recorded: false, duplicate: false, skipped: 'unknown-user' }

  const [existing] = await db
    .select({ id: payment.id })
    .from(payment)
    .where(
      and(
        eq(payment.provider, provider),
        eq(payment.providerPaymentId, providerPaymentId),
      ),
    )
    .limit(1)

  if (existing) return { recorded: false, duplicate: true }

  await db.insert(payment).values({
    id: `pay-${crypto.randomUUID()}`,
    userId,
    subscriptionId: subscriptionId ?? null,
    provider,
    providerPaymentId,
    amountCents,
    currency,
    status: 'paid',
    paidAt: paidAt ? new Date(paidAt).toISOString() : now(),
    createdAt: now(),
  })

  return { recorded: true, duplicate: false }
}

/**
 * Vira `active`/`trialing` → `expired` quando `currentPeriodEnd` já passou.
 *
 * ⚠️ **Isto é o job que ninguém lembra.** O gate da Fase 4 filtra por
 * `subscription.status`, **não por data** — de propósito: comparar com "agora" dentro de
 * permission quebraria a convergência cliente/servidor que o Zero exige. Então sem
 * alguém rodar isto, assinatura vencida continua liberando conteúdo para sempre.
 *
 * Assinatura sem `currentPeriodEnd` (a concedida à mão pelo admin) **não expira** — é
 * concessão sem prazo, e inventar um seria pior.
 */
export async function expireOverdueSubscriptions(): Promise<{ expired: number }> {
  const db = getDb()

  const rows = await db
    .update(subscription)
    .set({ status: 'expired', updatedAt: now() })
    .where(
      and(
        inArray(subscription.status, ACTIVE),
        sql`${subscription.currentPeriodEnd} is not null`,
        lt(subscription.currentPeriodEnd, now()),
      ),
    )
    .returning({ id: subscription.id })

  return { expired: rows.length }
}
