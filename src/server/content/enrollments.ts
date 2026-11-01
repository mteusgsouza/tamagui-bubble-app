// Matrículas — quem tem qual curso, e por quê.
//
// `courseAccess` é puro (sem I/O); quem carrega as matrículas é o endpoint, **numa** query
// com `inArray` (invariante 12), e passa o `Set` adiante.

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'

import { getDb } from '~/database'
import { user } from '~/database/schema-private'
import { course, enrollment, userPublic } from '~/database/schema-public'
import { courseLockReason, enrollmentSource } from '~/server/access/contentAccess'
import { requireContentAdmin } from '~/server/access/viewer'
import { nowIso, toEpoch } from '~/server/api/serialize'

import type { CourseRow } from '~/server/access/contentAccess'
import type { Viewer } from '~/server/access/viewer'
import type { WriteResult } from './interactions'

export type EnrollmentSource = (typeof enrollment.$inferSelect)['source']

/** Ids dos cursos em que o usuário tem matrícula **ativa**, entre os dados. */
export async function loadEnrolledCourseIds(
  userId: string,
  courseIds: string[],
): Promise<Set<string>> {
  if (!userId || !courseIds.length) return new Set()
  const rows = await getDb()
    .select({ courseId: enrollment.courseId })
    .from(enrollment)
    .where(
      and(
        eq(enrollment.userId, userId),
        inArray(enrollment.courseId, courseIds),
        isNull(enrollment.revokedAt),
      ),
    )
  return new Set(rows.map((row) => row.courseId))
}

const forbidden = () =>
  ({ ok: false as const, status: 403, code: 'forbidden', message: 'Só o criador administra o conteúdo.' })

const notFound = (message: string) =>
  ({ ok: false as const, status: 404, code: 'not-found', message })

/**
 * Cria a matrícula, ou **reativa** a revogada: o índice único é por (userId, courseId), e
 * o histórico de "já esteve aqui" vale mais que uma linha nova. Idempotente.
 */
async function upsertEnrollment(args: {
  userId: string
  courseId: string
  source: EnrollmentSource
  subscriptionId?: string | null
  grantedBy?: string | null
}) {
  const db = getDb()
  const [existing] = await db
    .select()
    .from(enrollment)
    .where(and(eq(enrollment.userId, args.userId), eq(enrollment.courseId, args.courseId)))
    .limit(1)

  if (existing && !existing.revokedAt) return existing

  const values = {
    source: args.source,
    subscriptionId: args.subscriptionId ?? null,
    grantedBy: args.grantedBy ?? null,
  }

  if (existing) {
    const [row] = await db
      .update(enrollment)
      .set({ ...values, revokedAt: null })
      .where(eq(enrollment.id, existing.id))
      .returning()
    return row!
  }

  const [row] = await db
    .insert(enrollment)
    .values({
      id: `enr-${crypto.randomUUID()}`,
      userId: args.userId,
      courseId: args.courseId,
      ...values,
      createdAt: nowIso(),
    })
    .returning()
  return row!
}

export type EnrollResult = { enrollmentId: string; source: EnrollmentSource }

/**
 * `POST /api/enroll`. O servidor decide, nesta ordem, e nunca confia no cliente:
 * curso existe e publicado → já matriculado (idempotente) → público (`free`) →
 * a assinatura cobre (`subscription`) → 422 com o motivo.
 *
 * O preço não existe nesta fase (é da 20): o 422 é só o sinal de que a tela oferece
 * compra ou assinatura em vez de matrícula.
 */
export async function enroll(
  viewer: Viewer,
  args: { courseId: string },
): Promise<WriteResult<EnrollResult>> {
  const db = getDb()
  const [row] = await db.select().from(course).where(eq(course.id, args.courseId)).limit(1)
  if (!row || !row.published) return notFound('Curso não encontrado.')

  const [active] = await db
    .select()
    .from(enrollment)
    .where(
      and(
        eq(enrollment.userId, viewer.id),
        eq(enrollment.courseId, row.id),
        isNull(enrollment.revokedAt),
      ),
    )
    .limit(1)
  if (active) return { ok: true, enrollmentId: active.id, source: active.source }

  const source = enrollmentSource(viewer, row as CourseRow)
  if (!source) {
    const reason = courseLockReason(viewer, row as CourseRow)
    return {
      ok: false,
      status: 422,
      code: reason,
      message:
        reason === 'needs-purchase'
          ? 'Este curso não está incluído na sua assinatura.'
          : reason === 'needs-plan'
            ? 'O seu plano não inclui este curso.'
            : 'Assine para abrir este curso.',
    }
  }

  const sub = source === 'subscription' ? viewer.subscriptions.get(row.feedOwnerId) : null
  const saved = await upsertEnrollment({
    userId: viewer.id,
    courseId: row.id,
    source,
    subscriptionId: sub?.id ?? null,
  })
  return { ok: true, enrollmentId: saved.id, source: saved.source }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export type EnrollmentDTO = {
  id: string
  userId: string
  userName: string
  userEmail: string | null
  source: EnrollmentSource
  createdAt: number | null
  revokedAt: number | null
}

/** Os inscritos de um curso — uma query com `join`, sem laço. */
export async function loadEnrollments(
  viewer: Viewer,
  courseId: string,
): Promise<EnrollmentDTO[] | null> {
  if (!requireContentAdmin(viewer)) return null
  const rows = await getDb()
    .select({
      id: enrollment.id,
      userId: enrollment.userId,
      userName: userPublic.name,
      userEmail: user.email,
      source: enrollment.source,
      createdAt: enrollment.createdAt,
      revokedAt: enrollment.revokedAt,
    })
    .from(enrollment)
    .innerJoin(userPublic, eq(userPublic.id, enrollment.userId))
    .leftJoin(user, eq(user.id, enrollment.userId))
    .where(eq(enrollment.courseId, courseId))
    .orderBy(desc(enrollment.createdAt))

  return rows.map((row) => ({
    ...row,
    userName: row.userName ?? '',
    createdAt: toEpoch(row.createdAt),
    revokedAt: toEpoch(row.revokedAt),
  }))
}

/** Concessão à mão (`source: 'grant'`). Reativa a revogada. */
export async function grantEnrollment(
  viewer: Viewer,
  args: { courseId: string; userId: string },
): Promise<WriteResult<EnrollResult>> {
  if (!requireContentAdmin(viewer)) return forbidden()
  const db = getDb()

  const [found] = await db
    .select({ id: course.id })
    .from(course)
    .where(eq(course.id, args.courseId))
    .limit(1)
  if (!found) return notFound('Curso não encontrado.')

  const [pub] = await db
    .select({ id: userPublic.id })
    .from(userPublic)
    .where(eq(userPublic.id, args.userId))
    .limit(1)
  if (!pub) return notFound('Usuário não encontrado — ele precisa abrir o app uma vez.')

  const saved = await upsertEnrollment({
    userId: args.userId,
    courseId: args.courseId,
    source: 'grant',
    grantedBy: viewer.id,
  })
  return { ok: true, enrollmentId: saved.id, source: saved.source }
}

export async function revokeEnrollment(
  viewer: Viewer,
  args: { enrollmentId: string },
): Promise<WriteResult<{ enrollmentId: string }>> {
  if (!requireContentAdmin(viewer)) return forbidden()
  const [row] = await getDb()
    .update(enrollment)
    .set({ revokedAt: nowIso() })
    .where(and(eq(enrollment.id, args.enrollmentId), isNull(enrollment.revokedAt)))
    .returning({ id: enrollment.id })
  if (!row) return notFound('Matrícula não encontrada ou já revogada.')
  return { ok: true, enrollmentId: row.id }
}

/**
 * 🔴 **O único lugar que revoga matrícula por perda de assinatura.** Marca `revokedAt` nas
 * de `source = 'subscription'` **daquele** `subscriptionId`; compra e concessão não são
 * tocadas — perde o acesso, mas o que comprou é seu. Chamado por `revokeSubscription`, pelo
 * cron de vencimento e pelo caminho do webhook (`subscriptionActions`).
 */
export async function revokeEnrollmentsForSubscription(
  subscriptionIds: string | string[],
): Promise<number> {
  const ids = Array.isArray(subscriptionIds) ? subscriptionIds : [subscriptionIds]
  if (!ids.length) return 0
  const rows = await getDb()
    .update(enrollment)
    .set({ revokedAt: nowIso() })
    .where(
      and(
        inArray(enrollment.subscriptionId, ids),
        eq(enrollment.source, 'subscription'),
        isNull(enrollment.revokedAt),
      ),
    )
    .returning({ id: enrollment.id })
  return rows.length
}
