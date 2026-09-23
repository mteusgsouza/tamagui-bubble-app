// GET /api/me — quem é o visitante, o que ele assina, e o entitlement já resolvido.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL } from '~/server/api/respond'
import { loadMe } from '~/server/content/billing'

import type { Endpoint } from 'one'

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  try {
    const viewer = await loadViewer(auth)
    return Response.json(await loadMe(viewer))
  } catch (error) {
    console.error('[me] falhou', error)
    return fail(500, 'me-failed', 'Não deu para carregar sua conta.')
  }
}
