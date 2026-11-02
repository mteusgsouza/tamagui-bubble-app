// POST /api/billing/checkout — começa uma assinatura pelo adapter ativo.
//
// O corpo diz o plano **ou** o curso (`planId` | `courseId`); **quem assina é sempre a sessão**, nunca um `userId` do corpo —
// senão qualquer pessoa logada assinaria em nome de outra.
//
// ⚠️ **O provider `manual` é recusado aqui de propósito.** O `createCheckout` dele
// concede a assinatura na hora (é o que "concessão manual" significa), então expor essa
// rota com `BILLING_PROVIDER=manual` daria assinatura de graça a qualquer um que fizesse
// o POST. Concessão manual passa por `/api/admin/people`, que exige admin.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'
import { and, eq, isNull } from 'drizzle-orm'

import { MASTER_USER_ID } from '~/constants/creator'
import { getDb } from '~/database'
import { course, enrollment, plan } from '~/database/schema-public'
import { authServer } from '~/features/auth/server/authServer'
import { activeProvider } from '~/features/billing/registry'
import { enrollmentSource } from '~/server/access/contentAccess'
import { loadViewer } from '~/server/access/viewer'
import { fail } from '~/server/api/respond'

import type { CourseRow } from '~/server/access/contentAccess'
import type { CheckoutSubject } from '~/features/billing/types'

import type { Endpoint } from 'one'


export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return fail(401, 'unauthenticated', 'Faça login para assinar.')

  const provider = activeProvider()

  if (provider.id === 'manual') {
    return fail(
      501,
      'no-gateway',
      'Ainda não há gateway de pagamento configurado. Peça acesso ao criador.',
    )
  }

  let body: { planId?: unknown; courseId?: unknown; returnUrl?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return fail(400, 'invalid-json', 'Corpo não é JSON.')
  }

  const planId = typeof body.planId === 'string' ? body.planId : ''
  const courseId = typeof body.courseId === 'string' ? body.courseId : ''
  if (planId && courseId) {
    return fail(400, 'ambiguous-subject', 'Informe planId ou courseId, não os dois.')
  }
  if (!planId && !courseId) return fail(400, 'missing-plan', 'Informe planId ou courseId.')

  const db = getDb()
  let subject: CheckoutSubject

  if (courseId) {
    const [row] = await db.select().from(course).where(eq(course.id, courseId)).limit(1)
    if (!row || !row.published) return fail(404, 'course-not-found', 'Curso não encontrado.')
    if (row.priceCents == null || row.priceCents <= 0) {
      return fail(422, 'course-not-for-sale', 'Este curso não é vendido avulso.')
    }

    // quem já tem o curso (ou pode simplesmente se matricular) não paga de novo
    const viewer = await loadViewer(auth)
    const [active] = await db
      .select({ id: enrollment.id })
      .from(enrollment)
      .where(
        and(
          eq(enrollment.userId, viewer.id),
          eq(enrollment.courseId, row.id),
          isNull(enrollment.revokedAt),
        ),
      )
      .limit(1)
    if (active || enrollmentSource(viewer, row as CourseRow)) {
      return fail(422, 'already-has-access', 'Você já tem acesso a este curso.')
    }
    subject = { kind: 'course', courseId: row.id }
  } else {
    const [row] = await db
      .select({ id: plan.id, active: plan.active })
      .from(plan)
      .where(eq(plan.id, planId))
      .limit(1)

    if (!row) return fail(404, 'plan-not-found', 'Plano não encontrado.')
    if (!row.active) return fail(422, 'plan-inactive', 'Esse plano não está mais à venda.')
    subject = { kind: 'plan', planId }
  }

  try {
    const result = await provider.createCheckout({
      userId: auth.id,
      // app de um criador só: `plan` não tem dono, todos são do master
      creatorId: MASTER_USER_ID,
      subject,
      returnUrl: typeof body.returnUrl === 'string' ? body.returnUrl : undefined,
    })
    return Response.json({ provider: provider.id, ...result })
  } catch (err) {
    console.error('[billing] checkout falhou', err)
    return fail(
      500,
      'checkout-failed',
      err instanceof Error ? err.message : 'Não foi possível iniciar a assinatura.',
    )
  }
}
