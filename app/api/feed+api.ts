// GET /api/feed?limit=20&cursor=...  — o feed do criador, uma requisição.
//
// Substitui a query `feedPosts` do Zero. O que era uma assinatura reativa com cinco
// relações encadeadas por post virou 6 consultas de custo fixo — ver
// `src/server/content/posts.ts`.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { MASTER_USER_ID } from '~/constants/creator'
import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL } from '~/server/api/respond'
import { loadFeedPage } from '~/server/content/posts'

import type { Endpoint } from 'one'

const DEFAULT_LIMIT = 20
/** Teto. Sem ele, `?limit=100000` vira uma varredura e um JSON gigante. */
const MAX_LIMIT = 50

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  if (!MASTER_USER_ID) {
    return fail(503, 'no-creator', 'O feed não tem dono configurado.')
  }

  const params = new URL(request.url).searchParams
  const asked = Number(params.get('limit'))
  const limit = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT

  try {
    const viewer = await loadViewer(auth)
    const page = await loadFeedPage(viewer, {
      feedOwnerId: MASTER_USER_ID,
      limit,
      cursor: params.get('cursor'),
    })
    return Response.json(page)
  } catch (error) {
    console.error('[feed] falhou', error)
    return fail(500, 'feed-failed', 'Não deu para carregar o feed.')
  }
}
