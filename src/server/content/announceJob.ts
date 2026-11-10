// O job de aviso de conteúdo novo (Fase 22): varre, reivindica, seleciona e envia.
//
// 🔴 **"Exatamente uma vez" mora no `UPDATE ... WHERE "announcedAt" IS NULL RETURNING`.**
// Quem recebe a linha de volta é o dono do envio; o retry do cron, ou dois jobs em
// paralelo, recebem zero linhas e não enviam nada. Por isso a marca é coluna e não
// tabela, e por isso despublicar e republicar não avisa de novo: ninguém limpa a coluna.
//
// O custo dessa escolha é **no máximo uma vez**: reivindicou e o envio falhou, não
// reenvia. É a troca certa para aviso (melhor perder um e-mail que mandar dois a toda a
// base) e está dito no handoff.
//
// O fan-out não roda no request de publicar — o job varre depois.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { APP_NAME } from '~/constants/app'
import { getDb } from '~/database'
import { user } from '~/database/schema-private'
import {
  course,
  enrollment,
  lesson,
  post,
  subscription,
  userState,
} from '~/database/schema-public'
import { BETTER_AUTH_URL } from '~/server/env-server'
import { emailConfigured, sendEmail } from '~/server/email/send'
import { BRAND_ACCENT, BRAND_ACCENT_INK } from '~/tamagui/brandAccent'

import { toEpoch } from '~/server/api/serialize'

import {
  buildLessonMessage,
  buildPostMessage,
  selectLessonRecipients,
  selectPostRecipients,
} from './announce'

import type { EmailMessage, SendResult } from '~/server/email/send'
import type { Candidate } from './announce'

/** Conteúdo publicado há mais que isto não é "novo": é carimbado sem avisar ninguém. */
const FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const BRAND = { appName: APP_NAME, accent: BRAND_ACCENT, accentInk: BRAND_ACCENT_INK }

export type Counts = { claimed: number; recipients: number; sent: number; failed: number }

export type AnnounceResult =
  | { ok: true; posts: Counts; lessons: Counts }
  | { ok: false; reason: 'no-provider' }

const empty = (): Counts => ({ claimed: 0, recipients: 0, sent: 0, failed: 0 })

type Sender = (message: EmailMessage) => Promise<SendResult>

async function loadCandidates(userIds: string[]): Promise<Candidate[]> {
  if (!userIds.length) return []
  const db = getDb()
  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      banned: user.banned,
      notifyNewPost: userState.notifyNewPost,
      notifyNewLesson: userState.notifyNewLesson,
    })
    .from(user)
    .leftJoin(userState, eq(userState.userId, user.id))
    .where(inArray(user.id, userIds))

  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name,
    banned: r.banned,
    // quem nunca teve linha de preferência recebe o padrão (ligado)
    notifyNewPost: r.notifyNewPost ?? true,
    notifyNewLesson: r.notifyNewLesson ?? true,
  }))
}

async function deliver(
  recipients: Candidate[],
  build: () => { subject: string; text: string; html: string },
  send: Sender,
  counts: Counts,
) {
  const message = build()
  counts.recipients += recipients.length
  for (const person of recipients) {
    const result = await send({ to: person.email, ...message })
    if (result.ok) counts.sent += 1
    else counts.failed += 1
  }
}

async function announcePosts(send: Sender, now: number): Promise<Counts> {
  const db = getDb()
  const counts = empty()

  const pending = await db
    .select({
      id: post.id,
      feedOwnerId: post.feedOwnerId,
      title: post.title,
      teaser: post.teaser,
      requiredPlanId: post.requiredPlanId,
      publishedAt: post.publishedAt,
    })
    .from(post)
    .where(
      and(eq(post.published, true), eq(post.deleted, false), isNull(post.announcedAt)),
    )

  for (const row of pending) {
    // a reivindicação atômica: sem linha de volta, outro job já é o dono
    const claimed = await db
      .update(post)
      .set({ announcedAt: sql`now()` })
      .where(
        and(eq(post.id, row.id), eq(post.published, true), isNull(post.announcedAt)),
      )
      .returning({ id: post.id })
    if (!claimed.length) continue
    counts.claimed += 1

    const publishedAt = toEpoch(row.publishedAt) ?? now
    if (now - publishedAt > FRESH_WINDOW_MS) continue

    const subs = await db
      .select({
        userId: subscription.userId,
        creatorId: subscription.creatorId,
        planId: subscription.planId,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      })
      .from(subscription)
      .where(
        and(
          eq(subscription.creatorId, row.feedOwnerId),
          inArray(subscription.status, ['active', 'trialing']),
        ),
      )
    const subscriptions = subs.map((s) => ({
      ...s,
      currentPeriodEnd: toEpoch(s.currentPeriodEnd),
    }))
    const candidates = await loadCandidates(subscriptions.map((s) => s.userId))
    const recipients = selectPostRecipients({ post: row, candidates, subscriptions, now })

    await deliver(
      recipients,
      () => buildPostMessage({ post: row, baseUrl: BETTER_AUTH_URL, brand: BRAND }),
      send,
      counts,
    )
  }
  return counts
}

async function announceLessons(send: Sender, now: number): Promise<Counts> {
  const db = getDb()
  const counts = empty()

  const pending = await db
    .select({
      id: lesson.id,
      title: lesson.title,
      courseId: lesson.courseId,
      createdAt: lesson.createdAt,
      courseTitle: course.title,
      courseSlug: course.slug,
      coursePublished: course.published,
    })
    .from(lesson)
    .innerJoin(course, eq(course.id, lesson.courseId))
    .where(and(eq(lesson.published, true), isNull(lesson.announcedAt)))

  for (const row of pending) {
    const claimed = await db
      .update(lesson)
      .set({ announcedAt: sql`now()` })
      .where(
        and(eq(lesson.id, row.id), eq(lesson.published, true), isNull(lesson.announcedAt)),
      )
      .returning({ id: lesson.id })
    if (!claimed.length) continue
    counts.claimed += 1

    // aula de curso despublicado é carimbada sem avisar: se a gente deixasse pendente,
    // lançar o curso dispararia um e-mail por aula
    if (!row.coursePublished) continue
    if (now - (toEpoch(row.createdAt) ?? now) > FRESH_WINDOW_MS) continue

    const enrolled = await db
      .select({
        userId: enrollment.userId,
        courseId: enrollment.courseId,
        revokedAt: enrollment.revokedAt,
      })
      .from(enrollment)
      .where(and(eq(enrollment.courseId, row.courseId), isNull(enrollment.revokedAt)))
    const enrollments = enrolled.map((e) => ({
      ...e,
      revokedAt: toEpoch(e.revokedAt),
    }))
    const candidates = await loadCandidates(enrollments.map((e) => e.userId))
    const lessonRow = { ...row }
    const recipients = selectLessonRecipients({ lesson: lessonRow, candidates, enrollments })

    await deliver(
      recipients,
      () => buildLessonMessage({ lesson: lessonRow, baseUrl: BETTER_AUTH_URL, brand: BRAND }),
      send,
      counts,
    )
  }
  return counts
}

/**
 * Roda uma varredura. `send` é injetável para a prova no Postgres não depender de caixa
 * de entrada; em produção é o `sendEmail`.
 *
 * Sem provedor configurado **não reivindica nada**: carimbar sem poder enviar apagaria o
 * aviso para sempre. O conteúdo fica pendente até haver provedor (e a janela de frescor
 * impede que um backlog antigo vire enxurrada nesse dia).
 */
export async function runAnnounceJob(
  options: { send?: Sender; now?: number } = {},
): Promise<AnnounceResult> {
  const send = options.send ?? sendEmail
  if (!options.send && !emailConfigured()) return { ok: false, reason: 'no-provider' }

  const now = options.now ?? Date.now()
  const posts = await announcePosts(send, now)
  const lessons = await announceLessons(send, now)
  return { ok: true, posts, lessons }
}
