// A escrita da compra avulsa de curso — pagamento e matrícula numa transação só.
//
// Irmão de `subscriptionActions.ts`: lá moram assinatura e `recordPayment`; aqui, o que só
// existe quando o produto é um curso. Fica separado para `recordPayment` não ganhar um
// segundo modo de operar.

import { and, eq } from 'drizzle-orm'

import { getDb } from '~/database'
import { payment, user } from '~/database/schema-private'
import { course, userPublic } from '~/database/schema-public'
import { enrollByPurchase } from '~/server/content/enrollments'

export type RecordCoursePurchaseResult =
  | { recorded: true; duplicate: false; enrollmentId: string }
  | { recorded: false; duplicate: true }
  | {
      recorded: false
      duplicate: false
      skipped: 'unknown-user' | 'unknown-course' | 'no-public-profile'
    }

/**
 * Grava o pagamento **e** a matrícula, ou nenhum dos dois.
 *
 * **Idempotente por `providerPaymentId`**, como `recordPayment`: webhook reenviado devolve
 * `duplicate` e não mexe em nada. A checagem e a escrita estão na mesma transação, então
 * dois webhooks simultâneos do mesmo pagamento não gravam duas linhas — o segundo bate na
 * matrícula já existente (índice único por `userId + courseId`) em vez de duplicar.
 *
 * Não toca em `subscription`: curso comprado não cria assinatura e não renova.
 */
export async function recordCoursePurchase({
  userId,
  courseId,
  provider,
  providerPaymentId,
  amountCents,
  currency = 'BRL',
  paidAt,
}: {
  userId: string
  courseId: string
  provider: string
  providerPaymentId: string
  amountCents: number
  currency?: string
  /** epoch ms */
  paidAt?: number
}): Promise<RecordCoursePurchaseResult> {
  const db = getDb()

  // as três FKs do que vem a seguir viram 500 no webhook se o id vier errado — e gateway
  // que recebe 500 reenvia o mesmo evento para sempre
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1)
  if (!owner) return { recorded: false, duplicate: false, skipped: 'unknown-user' }

  const [found] = await db
    .select({ id: course.id })
    .from(course)
    .where(eq(course.id, courseId))
    .limit(1)
  if (!found) return { recorded: false, duplicate: false, skipped: 'unknown-course' }

  // `enrollment.userId` aponta para `userPublic`, não para `user` (invariante 2)
  const [pub] = await db
    .select({ id: userPublic.id })
    .from(userPublic)
    .where(eq(userPublic.id, userId))
    .limit(1)
  if (!pub) return { recorded: false, duplicate: false, skipped: 'no-public-profile' }

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: payment.id })
      .from(payment)
      .where(
        and(
          eq(payment.provider, provider),
          eq(payment.providerPaymentId, providerPaymentId),
        ),
      )
      .limit(1)
    if (existing) return { recorded: false, duplicate: true } as const

    const nowIso = new Date().toISOString()
    await tx.insert(payment).values({
      id: `pay-${crypto.randomUUID()}`,
      userId,
      subscriptionId: null,
      courseId,
      provider,
      providerPaymentId,
      amountCents,
      currency,
      status: 'paid',
      paidAt: paidAt ? new Date(paidAt).toISOString() : nowIso,
      createdAt: nowIso,
    })

    const enrolled = await enrollByPurchase(tx, { userId, courseId })
    return { recorded: true, duplicate: false, enrollmentId: enrolled.id } as const
  })
}
