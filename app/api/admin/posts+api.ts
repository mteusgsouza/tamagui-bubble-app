// GET  /api/admin/posts  — a lista do editor, com rascunho e apagado
// POST /api/admin/posts  — salvar, publicar, apagar, anexar e desanexar mídia
//
// Uma rota com `action` no corpo, como `app/api/admin/people+api.ts`: cada segmento
// dinâmico custaria uma regex, porque o `Endpoint` do One só declara `(req)`.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { MASTER_USER_ID } from '~/constants/creator'
import { isPostKind, isVisibility } from '~/data/enums'
import { authServer } from '~/features/auth/server/authServer'
import { loadViewer } from '~/server/access/viewer'
import { fail, FAIL, readJson } from '~/server/api/respond'
import {
  attachMedia,
  deletePost,
  detachMedia,
  loadAdminPosts,
  savePost,
  setPostPublished,
} from '~/server/content/adminPosts'

import type { Endpoint } from 'one'

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()
  if (!MASTER_USER_ID) return fail(503, 'no-creator', 'O feed não tem dono configurado.')

  try {
    const viewer = await loadViewer(auth)
    const posts = await loadAdminPosts(viewer, { feedOwnerId: MASTER_USER_ID })
    if (!posts) return FAIL.forbidden('Só o criador vê o editor.')
    return Response.json({ posts })
  } catch (error) {
    console.error('[admin/posts] listagem falhou', error)
    return fail(500, 'admin-posts-failed', 'Não deu para carregar os posts.')
  }
}

type Body = {
  action?: unknown
  id?: unknown
  kind?: unknown
  title?: unknown
  teaser?: unknown
  body?: unknown
  visibility?: unknown
  requiredPlanId?: unknown
  published?: unknown
  mediaId?: unknown
  postMediaId?: unknown
}

const str = (value: unknown) => (typeof value === 'string' ? value : '')
const orNull = (value: unknown) => (typeof value === 'string' && value ? value : null)

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()
  if (!MASTER_USER_ID) return fail(503, 'no-creator', 'O feed não tem dono configurado.')

  const payload = await readJson<Body>(request)
  if (!payload) return FAIL.invalidJson()

  try {
    const viewer = await loadViewer(auth)

    switch (payload.action) {
      case 'save': {
        // enum validado no limite: valor desconhecido vira 422 legível em vez de um
        // erro do Postgres, ou pior, uma linha que nenhuma tela sabe renderizar
        if (payload.kind !== undefined && !isPostKind(payload.kind)) {
          return fail(422, 'invalid-kind', 'Tipo de post desconhecido.')
        }
        if (payload.visibility !== undefined && !isVisibility(payload.visibility)) {
          return fail(422, 'invalid-visibility', 'Visibilidade desconhecida.')
        }
        const result = await savePost(viewer, {
          id: str(payload.id),
          feedOwnerId: MASTER_USER_ID,
          kind: isPostKind(payload.kind) ? payload.kind : 'text',
          title: orNull(payload.title),
          teaser: orNull(payload.teaser),
          body: typeof payload.body === 'string' ? payload.body : null,
          visibility: isVisibility(payload.visibility) ? payload.visibility : 'subscribers',
          requiredPlanId: orNull(payload.requiredPlanId),
        })
        return result.ok
          ? Response.json({ ok: true, postId: result.postId })
          : fail(result.status, result.code, result.message)
      }

      case 'publish':
      case 'unpublish': {
        const result = await setPostPublished(viewer, {
          postId: str(payload.id),
          published: payload.action === 'publish',
        })
        return result.ok
          ? Response.json({ ok: true, postId: result.postId, published: result.published })
          : fail(result.status, result.code, result.message)
      }

      case 'delete': {
        const result = await deletePost(viewer, { postId: str(payload.id) })
        return result.ok
          ? Response.json({ ok: true, postId: result.postId })
          : fail(result.status, result.code, result.message)
      }

      case 'attachMedia': {
        const result = await attachMedia(viewer, {
          postId: str(payload.id),
          mediaId: str(payload.mediaId),
        })
        return result.ok
          ? Response.json({ ok: true, postMediaId: result.postMediaId })
          : fail(result.status, result.code, result.message)
      }

      case 'detachMedia': {
        const result = await detachMedia(viewer, { postMediaId: str(payload.postMediaId) })
        return result.ok
          ? Response.json({ ok: true, postMediaId: result.postMediaId })
          : fail(result.status, result.code, result.message)
      }

      default:
        return FAIL.unknownAction()
    }
  } catch (error) {
    console.error('[admin/posts] escrita falhou', error)
    return fail(500, 'admin-posts-failed', 'Não deu para salvar.')
  }
}
