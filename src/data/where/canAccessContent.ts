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
 * "Este post **existe** para `userId`?" — só visibilidade, sem tier.
 *
 * 🔓 **Deliberadamente frouxo, e é o ponto da Fase 12.** Todo post publicado sincroniza
 * para todo usuário logado, com título, tipo, data, contadores e `teaser`. Antes o gate
 * filtrava a linha inteira, e quem não assinava via feed vazio — sem nenhum motivo para
 * pagar.
 *
 * 🔴 **Isto NÃO libera o conteúdo.** O texto está em `postContent` e a mídia em
 * `postMedia`, as duas atrás de `hasFullAccessToPost`. Se você for usar este helper em
 * alguma tabela nova, pergunte primeiro: essa linha é vitrine ou é produto?
 */
export const postVisibilityGate = (
  _: ExpressionBuilder<'post', Schema>,
  userId: string,
): Condition => {
  return _.or(
    // dono do feed vê tudo que é dele, inclusive rascunho e apagado
    _.cmp('feedOwnerId', userId),
    _.and(_.cmp('published', true), _.cmp('deleted', false)),
  )
}

/**
 * "Este post está **liberado** para `userId`?" — visibilidade **mais** o tier.
 *
 * Era o `postGate`. O nome mudou porque agora existem dois gates e confundi-los vaza
 * conteúdo pago: este é o que vale para tudo que é produto (`postContent`, `postMedia`,
 * `comment`, `reaction`).
 *
 * Reaproveitado dentro de `exists('post', ...)` pelas tabelas penduradas no post — o
 * overload `where(expressionFactory)` entrega o mesmo `ExpressionBuilder<'post'>` que o
 * `serverWhere('post')` recebe.
 */
export const hasFullAccessToPost = (
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

/**
 * 🔓 O post como **vitrine**: chega a todo usuário logado, bloqueado ou não.
 *
 * A tela distingue os dois estados pela ausência de `content` — ver `postContent.ts`.
 */
export const canAccessPost = serverWhere('post', (_, auth) => {
  if (!auth?.id) return false
  return postVisibilityGate(_, auth.id)
})

/**
 * 🔒 O post como **produto**. É aqui que o paywall passa a morar.
 *
 * `postContent` não tem `feedOwnerId` nem `visibility` — tudo isso está em `post`, então
 * a checagem sobe pela relação. É o mesmo `exists` dentro de `exists` que
 * `canAccessLesson` já usa.
 */
export const canAccessPostContent = serverWhere('postContent', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('post', (q) => q.where((pq) => hasFullAccessToPost(pq, userId)))
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
    _.exists('post', (q) => q.where((pq) => hasFullAccessToPost(pq, userId))),
  )
})

export const canAccessReaction = serverWhere('reaction', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('post', (q) => q.where((pq) => hasFullAccessToPost(pq, userId)))
})

export const canAccessPostMedia = serverWhere('postMedia', (_, auth) => {
  if (!auth?.id) return false
  const userId = auth.id
  return _.exists('post', (q) => q.where((pq) => hasFullAccessToPost(pq, userId)))
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
