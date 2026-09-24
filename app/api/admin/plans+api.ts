// GET  /api/admin/plans — inclui os planos fora de venda
// POST /api/admin/plans — salvar e ativar/desativar

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { isPlanInterval } from '~/data/enums'
import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, readJson } from '~/server/api/respond'
import { loadAdminPlans, savePlan, setPlanActive } from '~/server/content/adminPlans'

import type { Endpoint } from 'one'

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  try {
    const viewer = await loadViewer(auth)
    const plans = await loadAdminPlans(viewer)
    if (!plans) return FAIL.forbidden('Só o criador administra os planos.')
    return Response.json({ plans })
  } catch (error) {
    console.error('[admin/plans] listagem falhou', error)
    return fail(500, 'admin-plans-failed', 'Não deu para carregar os planos.')
  }
}

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const p = await readJson<Record<string, unknown>>(request)
  if (!p) return FAIL.invalidJson()

  const str = (value: unknown) => (typeof value === 'string' ? value : '')

  try {
    const viewer = await loadViewer(auth)

    if (p.action === 'save') {
      if (p.interval !== undefined && !isPlanInterval(p.interval)) {
        return fail(422, 'invalid-interval', 'Periodicidade desconhecida.')
      }
      const result = await savePlan(viewer, {
        id: str(p.id),
        slug: str(p.slug),
        name: str(p.name),
        priceCents: Number(p.priceCents),
        currency: str(p.currency) || 'BRL',
        interval: isPlanInterval(p.interval) ? p.interval : 'month',
        accessDays: p.accessDays == null ? null : Number(p.accessDays),
        active: p.active !== false,
      })
      return result.ok
        ? Response.json({ ok: true, planId: result.planId })
        : fail(result.status, result.code, result.message)
    }

    if (p.action === 'toggleActive') {
      const result = await setPlanActive(viewer, {
        planId: str(p.id),
        active: p.active === true,
      })
      return result.ok
        ? Response.json({ ok: true, planId: result.planId, active: result.active })
        : fail(result.status, result.code, result.message)
    }

    return FAIL.unknownAction()
  } catch (error) {
    console.error('[admin/plans] escrita falhou', error)
    return fail(500, 'admin-plans-failed', 'Não deu para salvar o plano.')
  }
}
