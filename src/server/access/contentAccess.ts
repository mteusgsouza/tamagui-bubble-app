// O paywall. Substitui `src/data/where/canAccessContent.ts`.
//
// Lá eram 230 linhas de `_.exists()` aninhado que o Zero traduzia em subconsulta
// correlacionada por linha. Aqui são predicados **puros** sobre o `Viewer` já carregado:
// nada de I/O, nada de SQL, e — pela primeira vez — testável sem banco. O paywall é o
// lugar onde um engano vaza conteúdo pago, e era o único sem cobertura.
//
// A regra é idêntica à anterior, linha a linha. O que muda é onde ela roda.
//
// 🔴 **Uma regra, um lugar.** `resolveMediaAccess` (`src/server/media/mediaAccess.ts`)
// carregava uma cópia da mesma lógica, com o comentário "mudou lá, muda aqui". Agora ela
// chama `tierAllows` daqui — a divergência deixa de ser possível por construção.

import type { Viewer } from './viewer'

/** As colunas que decidem o tier. Qualquer linha que as tenha serve. */
export type GatedRow = {
  feedOwnerId: string
  visibility: string
  requiredPlanId: string | null
}

export type LockReason = 'needs-subscription' | 'needs-plan'

export type Access = { allowed: true } | { allowed: false; reason: LockReason }

const ALLOWED: Access = { allowed: true }

/**
 * Dono do feed e admin passam por cima de tudo, inclusive rascunho e apagado.
 *
 * Espelha duas coisas do Zero ao mesmo tempo: o `defaultAllowAdminRole: 'all'` de
 * `src/zero/server.ts`, e o `_.cmp('feedOwnerId', userId)` com que todo gate começava.
 */
const isPrivileged = (viewer: Viewer, row: { feedOwnerId: string }) =>
  viewer.isAdmin || row.feedOwnerId === viewer.id

/**
 * O coração: este visitante tem direito a este conteúdo?
 *
 * Sem plano exigido, qualquer assinatura ativa ao criador libera. Com plano exigido, a
 * assinatura tem que ser **daquele** plano — é o join de duas colunas
 * (`feedOwnerId + requiredPlanId` ↔ `creatorId + planId`) que a decisão 10 do `STATE`
 * descreve, agora resolvido por consulta a um `Set`.
 */
export function tierAllows(viewer: Viewer, row: GatedRow): boolean {
  if (row.visibility === 'public') return true
  return row.requiredPlanId
    ? viewer.plans.has(`${row.feedOwnerId}:${row.requiredPlanId}`)
    : viewer.creators.has(row.feedOwnerId)
}

/**
 * Por que ficou bloqueado — "assine" ou "seu plano não inclui isto" são telas
 * diferentes. Mesmo critério de `resolveMediaAccess`: se o usuário assina **algo** do
 * criador, o que falta é plano.
 */
const denyReason = (viewer: Viewer, row: GatedRow): LockReason =>
  viewer.creators.has(row.feedOwnerId) ? 'needs-plan' : 'needs-subscription'

const deny = (viewer: Viewer, row: GatedRow): Access => ({
  allowed: false,
  reason: denyReason(viewer, row),
})

// ---------------------------------------------------------------------------
// Post
// ---------------------------------------------------------------------------

export type PostRow = GatedRow & { published: boolean; deleted: boolean }

/**
 * 🔓 "Este post **existe** para o visitante?" — só visibilidade, sem tier.
 *
 * Deliberadamente frouxo, e é o ponto da Fase 12: o post publicado chega a todo usuário
 * logado com título, tipo, data, contadores e `teaser`. Antes de a Fase 12 existir, quem
 * não assinava via feed vazio — sem nenhum motivo para pagar.
 *
 * 🔴 **Isto NÃO libera o conteúdo.** O corpo e a mídia ficam atrás de `postAccess`.
 */
export const canSeePost = (viewer: Viewer, post: PostRow): boolean =>
  isPrivileged(viewer, post) || (post.published && !post.deleted)

/**
 * 🔒 "Este post está **liberado**?" — visibilidade mais o tier.
 *
 * É o gate que vale para tudo que é produto: `postContent`, `postMedia`, `comment`,
 * `reaction`. Confundir com `canSeePost` vaza conteúdo pago — foi o que já aconteceu
 * uma vez, quando as permissions não estavam aplicadas nas relações do feed.
 */
export function postAccess(viewer: Viewer, post: PostRow): Access {
  if (isPrivileged(viewer, post)) return ALLOWED
  if (!post.published || post.deleted) return deny(viewer, post)
  return tierAllows(viewer, post) ? ALLOWED : deny(viewer, post)
}

/** Escrever num post (comentar, reagir) exige o mesmo que ler o conteúdo dele. */
export const canWriteToPost = (viewer: Viewer, post: PostRow): boolean =>
  postAccess(viewer, post).allowed

// ---------------------------------------------------------------------------
// Curso e aula
// ---------------------------------------------------------------------------

export type CourseRow = GatedRow & { published: boolean }

/** Mesma regra do post, sem `deleted` — curso não tem essa coluna. */
export function courseAccess(viewer: Viewer, course: CourseRow): Access {
  if (isPrivileged(viewer, course)) return ALLOWED
  if (!course.published) return deny(viewer, course)
  return tierAllows(viewer, course) ? ALLOWED : deny(viewer, course)
}

export type LessonRow = { published: boolean; freePreview: boolean }

/**
 * Aula: liberada se o curso está liberado, ou se é amostra grátis num curso publicado.
 *
 * ⚠️ O `freePreview` **não fura curso despublicado** — as duas condições exigem
 * `course.published`. Era assim no Zero e continua sendo.
 */
export function lessonAccess(
  viewer: Viewer,
  lesson: LessonRow,
  course: CourseRow,
): Access {
  if (isPrivileged(viewer, course)) return ALLOWED
  if (!lesson.published || !course.published) return deny(viewer, course)
  if (lesson.freePreview) return ALLOWED
  return courseAccess(viewer, course)
}

// ---------------------------------------------------------------------------
// Pendurados no post
// ---------------------------------------------------------------------------

/** Comentário: apagado nunca aparece, e o post precisa estar liberado. */
export const canSeeComment = (
  viewer: Viewer,
  comment: { deleted: boolean },
  post: PostRow,
): boolean => !comment.deleted && postAccess(viewer, post).allowed
