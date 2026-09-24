// POST /api/reactions — curtir e descurtir.
//
// 🔴 O corpo manda **estado desejado** (`liked: true|false`), nunca "inverta". Ver
// `setReaction` em `src/server/content/interactions.ts`.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, readJson } from '~/server/api/respond'
import { setReaction } from '~/server/content/interactions'

import type { Endpoint } from 'one'

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const body = await readJson<{ postId?: unknown; liked?: unknown }>(request)
  if (!body) return FAIL.invalidJson()

  const postId = typeof body.postId === 'string' ? body.postId : ''
  if (!postId) return FAIL.missingFields('Falta o post.')
  if (typeof body.liked !== 'boolean') {
    return FAIL.missingFields('`liked` tem que ser true ou false.')
  }

  try {
    const viewer = await loadViewer(auth)
    const result = await setReaction(viewer, { postId, liked: body.liked })
    if (!result.ok) return fail(result.status, result.code, result.message)
    return Response.json({ postId: result.postId, liked: result.liked, likeCount: result.likeCount })
  } catch (error) {
    console.error('[reactions] falhou', error)
    return fail(500, 'reaction-failed', 'Não deu para registrar sua curtida.')
  }
}
