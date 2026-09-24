// CRUD de planos.
//
// 🔴 **Plano nunca é apagado** (decisão 16 do `STATE`): assinatura já vendida aponta para
// ele, e o histórico de pagamento também. Tirar de venda é `active = false`.

import { eq, sql } from 'drizzle-orm'

import { getDb } from '~/database'
import { plan } from '~/database/schema-public'
import { requireContentAdmin } from '~/server/access/viewer'
import { isUniqueViolation } from '~/server/api/pgError'
import { loadPlans } from '~/server/content/billing'

import type { PlanDTO } from './dto'
import type { PlanInterval } from '~/data/enums'
import type { WriteResult } from './interactions'
import type { Viewer } from '~/server/access/viewer'

const forbidden = () =>
  ({
    ok: false as const,
    status: 403,
    code: 'forbidden',
    message: 'Só o criador administra os planos.',
  })

/** O editor vê inclusive os planos fora de venda. */
export async function loadAdminPlans(viewer: Viewer): Promise<PlanDTO[] | null> {
  if (!requireContentAdmin(viewer)) return null
  return loadPlans({ includeInactive: true })
}

export type SavePlanArgs = {
  id: string
  slug: string
  name: string
  priceCents: number
  currency?: string
  interval: PlanInterval
  accessDays?: number | null
  active: boolean
}

export async function savePlan(
  viewer: Viewer,
  args: SavePlanArgs,
): Promise<WriteResult<{ planId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  if (!args.name.trim() || !args.slug.trim()) {
    return {
      ok: false,
      status: 400,
      code: 'missing-fields',
      message: 'O plano precisa de nome e slug.',
    }
  }
  if (!Number.isFinite(args.priceCents) || args.priceCents < 0) {
    return { ok: false, status: 422, code: 'invalid-price', message: 'Preço inválido.' }
  }

  const db = getDb()
  try {
    await db
      .insert(plan)
      .values({
        id: args.id,
        slug: args.slug.trim(),
        name: args.name.trim(),
        priceCents: args.priceCents,
        currency: args.currency ?? 'BRL',
        interval: args.interval,
        accessDays: args.accessDays ?? null,
        active: args.active,
        order: sql`(select coalesce(max("order"), -1) + 1 from "plan")`,
      })
      .onConflictDoUpdate({
        target: plan.id,
        set: {
          slug: args.slug.trim(),
          name: args.name.trim(),
          priceCents: args.priceCents,
          currency: args.currency ?? 'BRL',
          interval: args.interval,
          accessDays: args.accessDays ?? null,
          active: args.active,
        },
      })
  } catch (error) {
    // `plan_slug_uidx` — devolver 500 aqui esconderia um erro que o usuário resolve
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        status: 422,
        code: 'slug-duplicado',
        message: `Já existe um plano com o slug "${args.slug.trim()}".`,
      }
    }
    throw error
  }

  return { ok: true, planId: args.id }
}

export async function setPlanActive(
  viewer: Viewer,
  args: { planId: string; active: boolean },
): Promise<WriteResult<{ planId: string; active: boolean }>> {
  if (!requireContentAdmin(viewer)) return forbidden()

  const db = getDb()
  const [row] = await db
    .update(plan)
    .set({ active: args.active })
    .where(eq(plan.id, args.planId))
    .returning({ id: plan.id })

  if (!row) {
    return { ok: false, status: 404, code: 'not-found', message: 'Plano não encontrado.' }
  }
  return { ok: true, planId: args.planId, active: args.active }
}
