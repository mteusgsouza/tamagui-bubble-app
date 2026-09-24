// POST /api/comments — criar e apagar comentário.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, readJson } from '~/server/api/respond'
import { createComment, deleteComment } from '~/server/content/interactions'

import type { Endpoint } from 'one'

type Body = {
  action?: unknown
  postId?: unknown
  body?: unknown
  parentId?: unknown
  commentId?: unknown
}

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const payload = await readJson<Body>(request)
  if (!payload) return FAIL.invalidJson()

  const str = (value: unknown) => (typeof value === 'string' ? value : '')

  try {
    const viewer = await loadViewer(auth)

    if (payload.action === 'create') {
      const result = await createComment(viewer, {
        postId: str(payload.postId),
        body: str(payload.body),
        parentId: str(payload.parentId) || null,
      })
      if (!result.ok) return fail(result.status, result.code, result.message)
      return Response.json({ comment: result.comment, commentCount: result.commentCount })
    }

    if (payload.action === 'delete') {
      const result = await deleteComment(viewer, { commentId: str(payload.commentId) })
      if (!result.ok) return fail(result.status, result.code, result.message)
      return Response.json({ commentId: result.commentId, commentCount: result.commentCount })
    }

    return FAIL.unknownAction()
  } catch (error) {
    console.error('[comments] falhou', error)
    return fail(500, 'comment-failed', 'Não deu para salvar o comentário.')
  }
}
