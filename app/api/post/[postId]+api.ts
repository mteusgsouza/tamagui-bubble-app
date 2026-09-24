// GET /api/post/<id>  — um post com a árvore de comentários.
//
// Substitui a query `postDetail` do Zero.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, pathParam } from '~/server/api/respond'
import { loadPostDetail } from '~/server/content/posts'

import type { Endpoint } from 'one'

// o `Endpoint` do One só declara `(req)`, embora o runtime chame `(req, { params })`.
// Tirar do caminho é o padrão que `app/api/media/[id]/play+api.ts` estabeleceu.
const ID_FROM_PATH = /\/api\/post\/([^/]+)\/?$/

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const postId = pathParam(request, ID_FROM_PATH)
  if (!postId) return fail(400, 'invalid-id', 'Post inválido.')

  try {
    const viewer = await loadViewer(auth)
    const post = await loadPostDetail(viewer, postId)

    // 404 também para rascunho alheio e apagado: a tela não deve revelar que existem
    if (!post) return FAIL.notFound('Post indisponível.')

    return Response.json({ post })
  } catch (error) {
    console.error('[post] falhou', error)
    return fail(500, 'post-failed', 'Não deu para carregar o post.')
  }
}
