// O paywall dos **bytes**.
//
// `canAccessMedia` (src/data/where/canAccessContent.ts) é de propósito mais frouxa que o
// gate do post: quem tem qualquer assinatura ativa ao criador recebe as linhas de
// `media` dele, ignorando `requiredPlanId`. O que vaza ali é `storageKey`, não o
// arquivo. Este módulo é quem fecha o buraco: antes de assinar a URL do R2 ele refaz o
// gate **com o tier**, lendo direto do Postgres — leitura fresca, sem o cache do JWT de
// 3 anos.
//
// A regra segue `postGate`/`courseGate` linha a linha; a única diferença é que aqui
// `requiredPlanId` é obrigatório. Mudou lá, muda aqui.

import { and, eq, inArray } from 'drizzle-orm'

import { ACTIVE_SUBSCRIPTION_STATUSES, MASTER_USER_ID } from '~/constants/creator'
import { getDb } from '~/database'
import {
  course,
  lesson,
  media,
  post,
  postMedia,
  subscription,
} from '~/database/schema-public'
import { getIsAdmin } from '~/server/getIsAdmin'

import type { AuthData } from '~/features/auth/types'

const ACTIVE = [...ACTIVE_SUBSCRIPTION_STATUSES]

export type MediaRow = typeof media.$inferSelect

/**
 * Quem pode **subir** mídia: admin ou o usuário mestre.
 *
 * O plano da Fase 5 dizia só "exige admin", mas o criador semeado pelas migrations tem
 * `role = 'user'` e o `ADMIN_WHITELIST` vem com e-mails de exemplo — só admin travaria
 * a própria validação da fase. Num produto de criador único o dono do feed é quem
 * publica, então `MASTER_USER_ID` entra junto. Quando a Fase 8 tiver o admin de
 * verdade, promover o criador a `role = 'admin'` e apagar a segunda condição é uma
 * simplificação segura.
 */
export const canUploadMedia = (auth: AuthData | null | undefined) =>
  Boolean(auth && (getIsAdmin(auth) || (MASTER_USER_ID && auth.id === MASTER_USER_ID)))

/**
 * Um "portão": um conteúdo publicado ao qual a mídia está pendurada. A mídia libera se
 * **qualquer** portão liberar — a mesma foto pode estar num post aberto e num curso pago.
 */
type Gate = {
  feedOwnerId: string
  requiredPlanId: string | null
  /** true = não precisa de assinatura nenhuma (post público, aula de amostra) */
  free: boolean
}

export type MediaAccessReason =
  | 'owner'
  | 'admin'
  | 'free'
  | 'subscription'
  | 'media-not-found'
  | 'no-published-attachment'
  | 'needs-subscription'
  | 'needs-plan'

export type MediaAccessResult =
  | { allowed: true; media: MediaRow; reason: MediaAccessReason }
  | { allowed: false; media: MediaRow | null; reason: MediaAccessReason }

/**
 * Todo conteúdo publicado que aponta para esta mídia.
 *
 * Conteúdo despublicado, apagado ou de curso despublicado não vira portão — para quem
 * não é dono, ele simplesmente não existe.
 */
async function collectGates(mediaId: string): Promise<Gate[]> {
  const db = getDb()

  const [fromPosts, fromLessons, fromCovers] = await Promise.all([
    // 1. anexo de post (media -> postMedia -> post)
    db
      .select({
        feedOwnerId: post.feedOwnerId,
        visibility: post.visibility,
        requiredPlanId: post.requiredPlanId,
        published: post.published,
        deleted: post.deleted,
      })
      .from(postMedia)
      .innerJoin(post, eq(post.id, postMedia.postId))
      .where(eq(postMedia.mediaId, mediaId)),

    // 2. vídeo/áudio de aula (lesson.mediaId), com o curso que a contém
    db
      .select({
        feedOwnerId: course.feedOwnerId,
        visibility: course.visibility,
        requiredPlanId: course.requiredPlanId,
        coursePublished: course.published,
        lessonPublished: lesson.published,
        freePreview: lesson.freePreview,
      })
      .from(lesson)
      .innerJoin(course, eq(course.id, lesson.courseId))
      .where(eq(lesson.mediaId, mediaId)),

    // 3. capa de curso (course.coverMediaId)
    db
      .select({
        feedOwnerId: course.feedOwnerId,
        visibility: course.visibility,
        requiredPlanId: course.requiredPlanId,
        published: course.published,
      })
      .from(course)
      .where(eq(course.coverMediaId, mediaId)),
  ])

  const gates: Gate[] = []

  for (const row of fromPosts) {
    if (!row.published || row.deleted) continue
    gates.push({
      feedOwnerId: row.feedOwnerId,
      requiredPlanId: row.requiredPlanId,
      free: row.visibility === 'public',
    })
  }

  for (const row of fromLessons) {
    // as duas portas da aula exigem curso E aula publicados — `freePreview` não fura
    // curso em rascunho (mesma regra de `canAccessLesson`)
    if (!row.coursePublished || !row.lessonPublished) continue
    gates.push({
      feedOwnerId: row.feedOwnerId,
      requiredPlanId: row.requiredPlanId,
      free: row.freePreview || row.visibility === 'public',
    })
  }

  for (const row of fromCovers) {
    if (!row.published) continue
    gates.push({
      feedOwnerId: row.feedOwnerId,
      requiredPlanId: row.requiredPlanId,
      free: row.visibility === 'public',
    })
  }

  return gates
}

/**
 * Decide se `auth` pode receber os bytes de `mediaId`.
 *
 * Ordem: dono, admin, portão aberto, assinatura. Mídia órfã (sem nenhum conteúdo
 * publicado apontando para ela) é negada — o default fecha, não abre.
 */
export async function resolveMediaAccess(
  mediaId: string,
  auth: AuthData,
): Promise<MediaAccessResult> {
  const db = getDb()

  const [row] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1)
  if (!row) return { allowed: false, media: null, reason: 'media-not-found' }

  // o criador vê o que é dele, inclusive upload ainda `pending`
  if (row.ownerId === auth.id) return { allowed: true, media: row, reason: 'owner' }

  // espelha o `defaultAllowAdminRole: 'all'` do src/zero/server.ts
  if (auth.role === 'admin') return { allowed: true, media: row, reason: 'admin' }

  const gates = await collectGates(mediaId)
  if (gates.length === 0) {
    return { allowed: false, media: row, reason: 'no-published-attachment' }
  }

  if (gates.some((gate) => gate.free)) {
    return { allowed: true, media: row, reason: 'free' }
  }

  const creatorIds = [...new Set(gates.map((gate) => gate.feedOwnerId))]

  const subs = await db
    .select({ creatorId: subscription.creatorId, planId: subscription.planId })
    .from(subscription)
    .where(
      and(
        eq(subscription.userId, auth.id),
        inArray(subscription.creatorId, creatorIds),
        inArray(subscription.status, ACTIVE),
      ),
    )

  // assinatura ativa àquele criador, em qualquer plano
  const activeCreators = new Set(subs.map((sub) => sub.creatorId))
  // ...e o par criador+plano, que é o que `requiredPlanId` exige
  const activePlans = new Set(subs.map((sub) => `${sub.creatorId}:${sub.planId}`))

  const allowed = gates.some((gate) =>
    gate.requiredPlanId
      ? activePlans.has(`${gate.feedOwnerId}:${gate.requiredPlanId}`)
      : activeCreators.has(gate.feedOwnerId),
  )

  if (allowed) return { allowed: true, media: row, reason: 'subscription' }

  // distingue "não assina" de "assina o plano errado" — a UI mostra telas diferentes
  const reason = activeCreators.size > 0 ? 'needs-plan' : 'needs-subscription'
  return { allowed: false, media: row, reason }
}
