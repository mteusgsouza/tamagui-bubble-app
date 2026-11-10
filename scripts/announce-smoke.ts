#!/usr/bin/env bun

/**
 * @description Prova o aviso de conteúdo novo (Fase 22) direto no Postgres.
 *
 *   bun run:dev scripts/announce-smoke.ts
 *
 * Roda o job com um `send` falso que só anota o destinatário. Cria criador-alvo, curso,
 * pessoas e conteúdo descartáveis e apaga tudo ao final. ⚠️ Roda o job de verdade: ele
 * também varre conteúdo real ainda não anunciado — o `send` falso garante que nada sai.
 */

import { eq, inArray, like } from 'drizzle-orm'

import { getDb } from '../src/database'
import { user } from '../src/database/schema-private'
import {
  course,
  enrollment,
  lesson,
  plan,
  post,
  subscription,
  userPublic,
  userState,
} from '../src/database/schema-public'
import { runAnnounceJob } from '../src/server/content/announceJob'

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Não roda em produção.')
  process.exit(1)
}

const db = getDb()
const CREATOR = process.env.VITE_MASTER_USER_ID || 'demo-user-id'
const tag = `smoke-${Date.now()}`

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? '✅' : '🔴'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const ids = {
  subOn: `${tag}-sub-on`,
  subOff: `${tag}-sub-off`,
  subExpired: `${tag}-sub-expired`,
  student: `${tag}-student`,
  revoked: `${tag}-revoked`,
  postId: `${tag}-post`,
  planId: `${tag}-plan`,
  courseId: `${tag}-course`,
  lessonId: `${tag}-lesson`,
}
const people = [ids.subOn, ids.subOff, ids.subExpired, ids.student, ids.revoked]

const sent: { to: string; subject: string; text: string; html: string }[] = []
const send = async (m: (typeof sent)[number]) => {
  sent.push(m)
  return { ok: true as const }
}
const run = () => runAnnounceJob({ send })
const mine = () => sent.filter((m) => m.to.startsWith(tag))

async function cleanup() {
  await db.delete(post).where(like(post.id, `${tag}%`))
  await db.delete(course).where(like(course.id, `${tag}%`))
  // as assinaturas caem em cascata com a pessoa — e têm FK para o plano, então ele sai depois
  await db.delete(userPublic).where(inArray(userPublic.id, people))
  await db.delete(plan).where(like(plan.id, `${tag}%`))
  await db.delete(userState).where(inArray(userState.userId, people))
  await db.delete(user).where(inArray(user.id, people))
}

try {
  // criador + plano + pessoas
  await db.insert(plan).values({ id: ids.planId, slug: ids.planId, name: 'Smoke', priceCents: 100 })
  for (const id of people) {
    await db.insert(user).values({ id, email: `${id}@smoke.test`, name: id })
    await db.insert(userPublic).values({ id, name: id })
    await db.insert(userState).values({ userId: id, notifyNewPost: id !== ids.subOff })
  }
  const soon = new Date(Date.now() + 86_400_000).toISOString()
  const past = new Date(Date.now() - 86_400_000).toISOString()
  const mkSub = (userId: string, status: 'active' | 'expired', end: string) =>
    db.insert(subscription).values({
      id: `${tag}-s-${userId}`,
      userId,
      creatorId: CREATOR,
      planId: ids.planId,
      status,
      currentPeriodEnd: end,
    })
  await mkSub(ids.subOn, 'active', soon)
  await mkSub(ids.subOff, 'active', soon)
  await mkSub(ids.subExpired, 'expired', past)

  // 1+2: publicar post → job avisa só o assinante ativo com aviso ligado
  await db.insert(post).values({
    id: ids.postId,
    feedOwnerId: CREATOR,
    kind: 'text',
    title: 'Post do smoke',
    teaser: 'Isca do smoke',
    visibility: 'subscribers',
    published: true,
    publishedAt: new Date().toISOString(),
  })
  const first = await run()
  const postMails = mine().filter((m) => m.subject.includes('Post do smoke'))
  check('job rodou', first.ok)
  check(
    'post: só o assinante ativo com aviso ligado recebe',
    postMails.length === 1 && postMails[0]!.to === `${ids.subOn}@smoke.test`,
    postMails.map((m) => m.to).join(', '),
  )
  check('post: corpo traz o teaser', postMails[0]?.text.includes('Isca do smoke') ?? false)

  const [stamped] = await db.select({ at: post.announcedAt }).from(post).where(eq(post.id, ids.postId))
  check('post: announcedAt carimbado', Boolean(stamped?.at))

  // 2: de novo → zero envios, mesmo instante
  const before = sent.length
  await run()
  const [again] = await db.select({ at: post.announcedAt }).from(post).where(eq(post.id, ids.postId))
  check('segunda rodada: zero envios novos do smoke', mine().length === 1 && sent.length >= before)
  check('segunda rodada: announcedAt inalterado', again?.at === stamped?.at, String(again?.at))

  // 3: despublicar e republicar → continua sem avisar
  await db.update(post).set({ published: false }).where(eq(post.id, ids.postId))
  await run()
  await db.update(post).set({ published: true }).where(eq(post.id, ids.postId))
  await run()
  const [repub] = await db.select({ at: post.announcedAt }).from(post).where(eq(post.id, ids.postId))
  check('republicar não avisa de novo', mine().length === 1 && repub?.at === stamped?.at)

  // 4: aula → só matriculado ativo
  await db.insert(course).values({
    id: ids.courseId,
    feedOwnerId: CREATOR,
    slug: ids.courseId,
    title: 'Curso do smoke',
    published: true,
  })
  await db.insert(enrollment).values([
    { id: `${tag}-e1`, userId: ids.student, courseId: ids.courseId, source: 'grant' },
    {
      id: `${tag}-e2`,
      userId: ids.revoked,
      courseId: ids.courseId,
      source: 'grant',
      revokedAt: new Date().toISOString(),
    },
  ])
  await db.insert(lesson).values({
    id: ids.lessonId,
    courseId: ids.courseId,
    title: 'Aula do smoke',
    body: 'CORPO-SECRETO-DA-AULA',
    published: true,
  })
  await run()
  const lessonMails = mine().filter((m) => m.subject.includes('Aula do smoke'))
  check(
    'aula: só o matriculado ativo recebe (revogado e assinante de fora)',
    lessonMails.length === 1 && lessonMails[0]!.to === `${ids.student}@smoke.test`,
    lessonMails.map((m) => m.to).join(', '),
  )

  // 6: o corpo nunca entra
  const everything = mine()
    .map((m) => m.subject + m.text + m.html)
    .join('\n')
  check('nenhum aviso contém o body da aula', !everything.includes('CORPO-SECRETO-DA-AULA'))

  // aula de curso despublicado: carimba sem avisar
  await db.update(course).set({ published: false }).where(eq(course.id, ids.courseId))
  await db.insert(lesson).values({
    id: `${ids.lessonId}-2`,
    courseId: ids.courseId,
    title: 'Aula de curso rascunho',
    published: true,
  })
  await run()
  const [draftLesson] = await db
    .select({ at: lesson.announcedAt })
    .from(lesson)
    .where(eq(lesson.id, `${ids.lessonId}-2`))
  check(
    'aula de curso despublicado: carimbada e sem e-mail',
    Boolean(draftLesson?.at) && !mine().some((m) => m.subject.includes('curso rascunho')),
  )
} finally {
  await cleanup()
}

console.log(failures ? `\n🔴 ${failures} falha(s)` : '\n✅ tudo verde')
process.exit(failures ? 1 : 0)
