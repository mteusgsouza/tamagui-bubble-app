// GET  /api/admin/people  — usuários, assinaturas e total pago
// POST /api/admin/people  — conceder/revogar assinatura, promover/rebaixar
//
// Por que rota de API e não Zero:
//
// 1. `payment` é tabela **privada**, fora da publication do Zero de propósito — só dá
//    para lê-la no servidor.
// 2. `canAccessOwnSubscription` deixa cada um ver só a própria assinatura. Listar todas
//    exigiria `role = 'admin'` no JWT, e aí esbarra em (3).
// 3. ⚠️ **O JWT do Takeout dura 3 anos**, então a claim `role` fica congelada: promover
//    alguém a admin não teria efeito até o token renovar. Esta rota relê a role **do
//    Postgres** a cada chamada, então promoção vale na hora.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { getDb } from '~/database'
import { payment, user } from '~/database/schema-private'
import { plan, subscription } from '~/database/schema-public'
import { authServer } from '~/features/auth/server/authServer'
import {
  cancelSubscription,
  grantSubscription,
} from '~/features/billing/server/subscriptionActions'

import type { AuthData } from '~/features/auth/types'
import type { Endpoint } from 'one'

const fail = (status: number, code: string, message: string) =>
  Response.json({ error: message, code }, { status })

/**
 * Autorização que **não** confia na claim do JWT: lê `user.role` do banco.
 * Devolve o id do admin, ou `null`.
 */
async function requireAdmin(auth: AuthData | null): Promise<string | null> {
  if (!auth?.id) return null
  const db = getDb()
  const [row] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, auth.id))
    .limit(1)
  return row?.role === 'admin' ? auth.id : null
}

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return fail(401, 'unauthenticated', 'Faça login.')
  if (!(await requireAdmin(auth))) {
    return fail(403, 'forbidden', 'Só admin vê a base de usuários.')
  }

  const db = getDb()

  const people = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(user.createdAt)
    .limit(500)

  const ids = people.map((person) => person.id)
  if (ids.length === 0) return Response.json({ people: [], plans: [] })

  const subs = await db
    .select({
      id: subscription.id,
      userId: subscription.userId,
      creatorId: subscription.creatorId,
      planId: subscription.planId,
      planName: plan.name,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    })
    .from(subscription)
    .leftJoin(plan, eq(plan.id, subscription.planId))
    .where(inArray(subscription.userId, ids))

  // total pago por pessoa — é o "faturamento" que o plano pedia, lido da tabela privada
  const paid = await db
    .select({
      userId: payment.userId,
      totalCents: sql<number>`coalesce(sum(${payment.amountCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(payment)
    .where(and(inArray(payment.userId, ids), eq(payment.status, 'paid')))
    .groupBy(payment.userId)

  const paidByUser = new Map(paid.map((p) => [p.userId, p]))

  const plans = await db
    .select({ id: plan.id, name: plan.name, active: plan.active })
    .from(plan)
    .orderBy(plan.order)

  return Response.json({
    plans,
    people: people.map((person) => ({
      ...person,
      subscriptions: subs.filter((s) => s.userId === person.id),
      paidCents: paidByUser.get(person.id)?.totalCents ?? 0,
      paymentCount: paidByUser.get(person.id)?.count ?? 0,
    })),
  })
}

type PostBody = {
  action?: unknown
  userId?: unknown
  planId?: unknown
  creatorId?: unknown
  subscriptionId?: unknown
  role?: unknown
}

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return fail(401, 'unauthenticated', 'Faça login.')

  const adminId = await requireAdmin(auth)
  if (!adminId) return fail(403, 'forbidden', 'Só admin altera pessoas.')

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return fail(400, 'invalid-json', 'Corpo não é JSON.')
  }

  const db = getDb()
  const action = String(body.action || '')

  if (action === 'grant') {
    const userId = String(body.userId || '')
    const planId = String(body.planId || '')
    const creatorId = String(body.creatorId || '')
    if (!userId || !planId || !creatorId) {
      return fail(400, 'missing-fields', 'Informe userId, planId e creatorId.')
    }

    // mesma escrita que o webhook usa: uma assinatura por (usuário, criador)
    const result = await grantSubscription({
      userId,
      creatorId,
      planId,
      provider: 'manual',
      status: 'active',
    })

    if (!result.ok) return fail(422, result.code, result.message)
    return Response.json({
      ok: true,
      subscriptionId: result.subscriptionId,
      reused: result.reused,
    })
  }

  if (action === 'revoke') {
    const subscriptionId = String(body.subscriptionId || '')
    if (!subscriptionId) return fail(400, 'missing-fields', 'Informe subscriptionId.')

    // cancela em vez de apagar: o histórico importa para faturamento
    await cancelSubscription(subscriptionId)
    return Response.json({ ok: true })
  }

  if (action === 'setRole') {
    const userId = String(body.userId || '')
    const role = String(body.role || '')
    if (!userId || (role !== 'admin' && role !== 'user')) {
      return fail(400, 'missing-fields', "Informe userId e role ('admin' ou 'user').")
    }
    if (userId === adminId && role !== 'admin') {
      return fail(422, 'self-demote', 'Você não pode remover o próprio acesso de admin.')
    }

    await db.update(user).set({ role }).where(eq(user.id, userId))
    return Response.json({
      ok: true,
      // o cliente precisa saber que a mudança não vale no token antigo
      note: 'A claim `role` do JWT dura 3 anos: a pessoa precisa sair e entrar de novo.',
    })
  }

  return fail(400, 'unknown-action', `Ação desconhecida: ${action}`)
}
