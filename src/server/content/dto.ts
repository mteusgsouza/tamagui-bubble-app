// O contrato entre servidor e tela.
//
// As formas espelham `src/features/feed/types.ts`, que já eram escritas à mão e
// estruturais — não derivadas das queries do Zero. Isso foi sorte: a UI não precisa
// mudar de forma para deixar de usar o Zero.
//
// 🔴 **Timestamp é epoch em milissegundos**, como o Zero entregava. `timeAgo`, `asDate`
// e `courseStats` já esperam número; converter na fronteira (`toEpoch`) é o que mantém
// a migração respondível — se uma tela quebrar, não foi por causa de data.

import type { LockReason } from '~/server/access/contentAccess'

export type AuthorDTO = {
  id: string
  name: string | null
  username: string | null
  image: string | null
}

/** Idêntico a `MediaViewMedia` — o `<MediaView>` consome direto. */
export type MediaDTO = {
  id: string
  kind: string
  mime: string | null
  posterKey: string | null
  durationSec: number | null
  width: number | null
  height: number | null
}

export type PostMediaDTO = {
  id: string
  position: number
  media: MediaDTO | null
}

export type CommentDTO = {
  id: string
  userId: string
  body: string
  createdAt: number | null
  deleted: boolean
  parentId: string | null
  user: AuthorDTO | null
  replies?: CommentDTO[]
}

export type PostDTO = {
  id: string
  feedOwnerId: string
  kind: string
  title: string | null
  /** a isca do card bloqueado — pública de propósito, é o que convida a assinar */
  teaser: string | null
  visibility: string
  requiredPlanId: string | null
  publishedAt: number | null
  likeCount: number
  commentCount: number
  feedOwner: AuthorDTO | null

  /**
   * 🔴 **`null` quando o visitante não tem direito.** É o mesmo contrato de antes: o
   * corpo simplesmente não vem. `isPostLocked` continua funcionando sem alteração, e o
   * teste dele passa intocado.
   *
   * O que mudou é que agora existe uma decisão explícita no servidor em vez de uma
   * linha que "não sincronizou" — daí `locked` e `lockReason` logo abaixo.
   */
  content: { body: string | null } | null

  /** redundante com `content == null`, e de propósito: ver `locked` em dto.test */
  locked: boolean
  /** por que fechou — "assine" e "seu plano não inclui" são telas diferentes */
  lockReason: LockReason | null

  /** vazio quando bloqueado: mídia é produto, não vitrine */
  media: PostMediaDTO[]
  /** vazio quando bloqueado */
  comments: CommentDTO[]
  /** a reação do próprio visitante, achatada em booleano */
  liked: boolean
}

export type FeedPageDTO = {
  posts: PostDTO[]
  /** `null` = acabou o feed */
  nextCursor: string | null
}

// ---------------------------------------------------------------------------
// Cursos
// ---------------------------------------------------------------------------

/** 0 ou 1 linha, como a query do Zero entregava. Manter o array evita mexer em
 *  `lessonProgress()`, `isLessonComplete()` e `courseStats()`. */
export type LessonProgressDTO = {
  id: string
  positionSec: number
  completedAt: number | null
  updatedAt: number | null
}

export type LessonDTO = {
  id: string
  courseId: string
  moduleId: string | null
  title: string
  body: string | null
  durationSec: number | null
  order: number
  published: boolean
  freePreview: boolean
  media: MediaDTO | null
  progress: LessonProgressDTO[]
}

export type CourseModuleDTO = {
  id: string
  title: string
  order: number
  lessons: LessonDTO[]
}

export type CourseDTO = {
  id: string
  feedOwnerId: string
  slug: string
  title: string
  description: string | null
  visibility: string
  requiredPlanId: string | null
  published: boolean
  order: number
  coverMedia: MediaDTO | null
  requiredPlan: { id: string; name: string } | null
  modules: CourseModuleDTO[]
  /** todas as aulas, inclusive as soltas (sem `moduleId`) */
  lessons: LessonDTO[]

  /**
   * 🔓 Curso bloqueado **existe** e vem com vitrine: capa, título, descrição e o
   * currículo (títulos, ordem, duração). O que não vem é produto — `body` e `media` da
   * aula saem vazios.
   *
   * Antes a linha inteira era filtrada, e quem não assinava via "Nenhum curso por
   * aqui" — a mesma mentira que o feed contava antes da Fase 12, e que a própria tela
   * admitia no comentário. Sem catálogo não há motivo para assinar.
   */
  locked: boolean
  lockReason: LockReason | null
}

/** O detalhe da aula traz o contexto que o player usa no cabeçalho. */
export type LessonDetailDTO = LessonDTO & {
  module: { id: string; title: string; order: number } | null
  course: { id: string; slug: string; title: string } | null
}

// ---------------------------------------------------------------------------
// Planos e assinatura
// ---------------------------------------------------------------------------

export type PlanDTO = {
  id: string
  slug: string
  name: string
  priceCents: number
  currency: string
  interval: string
  accessDays: number | null
  active: boolean
  order: number
}

export type SubscriptionDTO = {
  id: string
  planId: string
  creatorId: string
  status: string
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
  plan: PlanDTO | null
}

/**
 * O bootstrap da sessão: quem é, o que assina, e o entitlement já resolvido.
 *
 * Existe para `assinar.tsx` e `SubscriptionCard.tsx` compartilharem **uma** chave de
 * cache em vez de cada tela perguntar a mesma coisa.
 */
export type MeDTO = {
  user: { id: string; isAdmin: boolean }
  subscription: SubscriptionDTO | null
  entitlement: { creators: string[]; plans: string[] }
}
