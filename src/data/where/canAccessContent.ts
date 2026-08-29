import { serverWhere } from 'on-zero'

import { ACTIVE_SUBSCRIPTION_STATUSES } from '~/constants/creator'

import type { Schema } from 'on-zero'
import type { Condition, ExpressionBuilder } from '@rocicorp/zero'

// O gate de acesso ao conteúdo pago.
//
// É um join server-side, não uma claim do JWT: o token do Takeout dura 3 anos
// (`src/features/auth/server/authServer.ts`), então qualquer entitlement embutido
// nele ficaria congelado. Estas permissions só rodam no servidor (`serverWhere`) —
// o cliente nunca recebe a linha que não passa.
//
// Admin não aparece em lugar nenhum aqui de propósito: `src/zero/server.ts` configura
// `defaultAllowAdminRole: 'all'`, então quem tem `role === 'admin'` já passa por cima de
// permission de query e de mutation. Repetir a checagem em 11 arquivos seria 11 lugares
// para errar.

const ACTIVE = [...ACTIVE_SUBSCRIPTION_STATUSES]

/**
 * "Este post está liberado para `userId`?"
 *
 * Reaproveitado dentro de `exists('post', ...)` pelas tabelas penduradas no post
 * (comment, reaction, postMedia) — o overload `where(expressionFactory)` entrega o
 * mesmo `ExpressionBuilder<'post'>` que o `serverWhere('post')` recebe.
 */
export const postGate = (
  _: ExpressionBuilder<'post', Schema>,
  userId: string,
): Condition => {
  return _.or(
    // dono do feed vê tudo que é dele, inclusive rascunho e apagado
    _.cmp('feedOwnerId', userId),
    _.and(
      _.cmp('published', true),
      _.cmp('deleted', false),
      _.or(
        _.cmp('visibility', 'public'),
        // sem plano exigido: qualquer assinatura ativa do criador libera
        _.and(
          _.cmp('requiredPlanId', 'IS', null),
          _.exists('creatorSubscriptions', (q) =>
            q.where('userId', userId).where('status', 'IN', ACTIVE),
          ),
        ),
        // com plano exigido: a assinatura tem que ser daquele plano
        _.and(
          _.cmp('requiredPlanId', 'IS NOT', null),
          _.exists('planSubscriptions', (q) =>
            q.where('userId', userId).where('status', 'IN', ACTIVE),
          ),
        ),
      ),
    ),
  )
}

/** Mesma regra do `postGate`, na tabela `course`. */
export const courseGate = (
  _: ExpressionBuilder<'course', Schema>,
  userId: string,
): Condition => {
  return _.or(
    _.cmp('feedOwnerId', userId),
    _.and(
      _.cmp('published', true),
      _.or(
        _.cmp('visibility', 'public'),
        _.and(
          _.cmp('requiredPlanId', 'IS', null),
          _.exists('creatorSubscriptions', (q) =>
            q.where('userId', userId).where('status', 'IN', ACTIVE),
          ),
        ),
        _.and(
          _.cmp('requiredPlanId', 'IS NOT', null),
          _.exists('planSubscriptions', (q) =>
            q.where('userId', userId).where('status', 'IN', ACTIVE),
          ),
        ),
      ),
    ),
  )
}

export const canAccessPost = serverWhere('post', (_, auth) => {
  if (!auth?.id) return false
  return postGate(_, auth.id)
})

export const canAccessCourse = serverWhere('course', (_, auth) => {
  if (!auth?.id) return false
  return courseGate(_, auth.id)
})

/**
 * Aula: liberada se o curso está liberado, ou se é `freePreview` num curso publicado.
 * O `freePreview` não fura curso despublicado — as duas checagens exigem
 * `course.published`.
 */
export const canAccessLesson = serverWhere('lesson', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.or(
    _.exists('course', (q) => q.where('feedOwnerId', userId)),
    _.and(
      _.cmp('published', true),
      _.or(
        _.and(
          _.cmp('freePreview', true),
          _.exists('course', (q) => q.where('published', true)),
        ),
        _.exists('course', (q) => q.where((cq) => courseGate(cq, userId))),
      ),
    ),
  )
})

export const canAccessCourseModule = serverWhere('courseModule', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('course', (q) => q.where((cq) => courseGate(cq, userId)))
})

export const canAccessComment = serverWhere('comment', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.and(
    _.cmp('deleted', false),
    _.exists('post', (q) => q.where((pq) => postGate(pq, userId))),
  )
})

export const canAccessReaction = serverWhere('reaction', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('post', (q) => q.where((pq) => postGate(pq, userId)))
})

export const canAccessPostMedia = serverWhere('postMedia', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('post', (q) => q.where((pq) => postGate(pq, userId)))
})

/**
 * Mídia. Regra deliberadamente mais frouxa que a do post: quem assina o criador recebe
 * as linhas de `media` dele.
 *
 * ⚠️ Isso ignora `requiredPlanId`: um assinante do Mensal recebe a linha da mídia
 * de um curso que exige o Anual. O que vaza é `storageKey`, não o arquivo — a Fase 5
 * serve o R2 por URL assinada e é lá que o tier tem que ser checado de novo, na hora
 * de assinar a URL. Está registrado no handoff.
 */
export const canAccessMedia = serverWhere('media', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.or(
    _.cmp('ownerId', userId),
    _.exists('ownerSubscriptions', (q) =>
      q.where('userId', userId).where('status', 'IN', ACTIVE),
    ),
    _.exists('posts', (q) =>
      q.where('published', true).where('deleted', false).where('visibility', 'public'),
    ),
  )
})

/** Assinatura e progresso: cada um só enxerga o que é seu. */
export const canAccessOwnSubscription = serverWhere('subscription', (_, auth) => {
  if (!auth?.id) return false
  return _.cmp('userId', auth.id)
})

export const canAccessOwnProgress = serverWhere('lessonProgress', (_, auth) => {
  if (!auth?.id) return false
  return _.cmp('userId', auth.id)
})

/** Planos são a tabela de preços: qualquer usuário logado lê. */
export const canAccessPlan = serverWhere('plan', (_, auth) => {
  return Boolean(auth?.id)
})
