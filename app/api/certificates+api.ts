// GET /api/certificates — os certificados de quem está logado ("Meus certificados").

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { fail, FAIL } from '~/server/api/respond'
import { loadMyCertificates } from '~/server/content/certificates'

import type { Endpoint } from 'one'

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  try {
    return Response.json({ certificates: await loadMyCertificates(auth.id) })
  } catch (error) {
    console.error('[certificates] falhou', error)
    return fail(500, 'certificates-failed', 'Não deu para carregar seus certificados.')
  }
}
