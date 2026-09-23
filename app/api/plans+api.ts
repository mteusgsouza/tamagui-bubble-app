// GET /api/plans — a tabela de preços. Só planos à venda.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { fail, FAIL } from '~/server/api/respond'
import { loadPlans } from '~/server/content/billing'

import type { Endpoint } from 'one'

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  try {
    return Response.json({ plans: await loadPlans() })
  } catch (error) {
    console.error('[plans] falhou', error)
    return fail(500, 'plans-failed', 'Não deu para carregar os planos.')
  }
}
