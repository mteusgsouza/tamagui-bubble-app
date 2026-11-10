// GET/PUT /api/notifications — a preferência de aviso de conteúdo novo (Fase 22).
//
// Mora em `userState`, que já tem uma linha por usuário. Quem nunca teve linha recebe o
// padrão (ligado) no GET e a linha é criada no primeiro PUT.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'
import { eq } from 'drizzle-orm'

import { getDb } from '~/database'
import { userState } from '~/database/schema-public'
import { authServer } from '~/features/auth/server/authServer'
import { fail, FAIL, readJson } from '~/server/api/respond'

import type { NotificationPrefs } from '~/server/content/dto'

import type { Endpoint } from 'one'

const load = async (userId: string): Promise<NotificationPrefs> => {
  const [row] = await getDb()
    .select({
      notifyNewPost: userState.notifyNewPost,
      notifyNewLesson: userState.notifyNewLesson,
    })
    .from(userState)
    .where(eq(userState.userId, userId))
    .limit(1)
  return row ?? { notifyNewPost: true, notifyNewLesson: true }
}

export const GET: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  try {
    return Response.json(await load(auth.id))
  } catch (error) {
    console.error('[notifications] GET falhou', error)
    return fail(500, 'notifications-failed', 'Não deu para carregar seus avisos.')
  }
}

export const PUT: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return FAIL.unauthenticated()

  const body = await readJson<Partial<NotificationPrefs>>(request)
  if (!body) return FAIL.invalidJson()

  const patch: Partial<NotificationPrefs> = {}
  if (typeof body.notifyNewPost === 'boolean') patch.notifyNewPost = body.notifyNewPost
  if (typeof body.notifyNewLesson === 'boolean') patch.notifyNewLesson = body.notifyNewLesson
  if (!Object.keys(patch).length) return FAIL.missingFields()

  try {
    await getDb()
      .insert(userState)
      .values({ userId: auth.id, ...patch })
      .onConflictDoUpdate({ target: userState.userId, set: patch })
    return Response.json(await load(auth.id))
  } catch (error) {
    console.error('[notifications] PUT falhou', error)
    return fail(500, 'notifications-failed', 'Não deu para salvar a preferência.')
  }
}
