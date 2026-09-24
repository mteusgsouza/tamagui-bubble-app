// GET /api/admin/post/<id> — o post para editar. Corpo sempre presente, sem gate.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, pathParam } from '~/server/api/respond'
import { loadAdminPost } from '~/server/content/adminPosts'

import type { Endpoint } from 'one'

const ID_FROM_PATH = /\/api\/admin\/post\/([^/]+)\/?$/

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const postId = pathParam(request, ID_FROM_PATH)
  if (!postId) return fail(400, 'invalid-id', 'Post inválido.')

  try {
    const viewer = await loadViewer(auth)
    const post = await loadAdminPost(viewer, postId)
    if (post === 'forbidden') return FAIL.forbidden('Só o criador vê o editor.')
    if (!post) return FAIL.notFound('Post não encontrado.')
    return Response.json({ post })
  } catch (error) {
    console.error('[admin/post] falhou', error)
    return fail(500, 'admin-post-failed', 'Não deu para carregar o post.')
  }
}
