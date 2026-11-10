#!/usr/bin/env bun

/**
 * @description Prova a emissão de certificado (Fase 21) direto no Postgres.
 *
 *   bun run:dev scripts/certificate-smoke.ts
 *
 * Chama `saveProgress` — o mesmo caminho do `POST /api/progress` — com visitantes
 * sintéticos, em curso e pessoas descartáveis que o script apaga ao final. Não precisa do
 * servidor no ar. ⚠️ Não substitui a prova no navegador (página pública em janela anônima).
 */

import { eq, inArray } from 'drizzle-orm'

import { getDb } from '../src/database'
import {
  certificate,
  course,
  enrollment,
  lesson,
  userPublic,
} from '../src/database/schema-public'
import { anonymousViewer } from '../src/server/access/viewer'
import { loadPublicCertificate } from '../src/server/content/certificates'
import { saveProgress } from '../src/server/content/interactions'

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Não roda em produção.')
  process.exit(1)
}

const db = getDb()
const CREATOR = process.env.VITE_MASTER_USER_ID || 'demo-user-id'
const tag = `smoke-${Date.now()}`

const learnerId = `${tag}-aluno`
const courseAll = `${tag}-all`
const courseMin = `${tag}-min`
const courseHigh = `${tag}-high`
const courseIds = [courseAll, courseMin, courseHigh]

let failures = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1
  console.log(`${ok ? '✅' : '🔴'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const learner = anonymousViewer(learnerId)
const creator = anonymousViewer(CREATOR)

async function makeCourse(
  id: string,
  rule: { completionRule: 'all' | 'min-lessons'; minLessons: number | null },
  lessons: number,
) {
  await db.insert(course).values({
    id,
    feedOwnerId: CREATOR,
    slug: id,
    title: `Curso ${id}`,
    visibility: 'public',
    published: true,
    certificateEnabled: true,
    ...rule,
  })
  for (let i = 1; i <= lessons; i++) {
    await db.insert(lesson).values({
      id: `${id}-l${i}`,
      courseId: id,
      title: `Aula ${i}`,
      order: i,
      published: true,
    })
  }
  await db
    .insert(enrollment)
    .values({ id: `${id}-e`, userId: learnerId, courseId: id, source: 'free' })
}

const done = (lessonId: string, viewer = learner) =>
  saveProgress(viewer, { lessonId, positionSec: 10, completed: true })

const certCount = async (courseId: string, userId = learnerId) =>
  (await db.select().from(certificate).where(eq(certificate.courseId, courseId))).filter(
    (row) => row.userId === userId,
  ).length

async function cleanup() {
  await db.delete(course).where(inArray(course.id, courseIds))
  await db.delete(userPublic).where(eq(userPublic.id, learnerId))
}

try {
  await cleanup()
  await db.insert(userPublic).values({ id: learnerId, name: 'Aluna de Teste' })

  await makeCourse(courseAll, { completionRule: 'all', minLessons: null }, 3)
  await makeCourse(courseMin, { completionRule: 'min-lessons', minLessons: 2 }, 5)
  await makeCourse(courseHigh, { completionRule: 'min-lessons', minLessons: 99 }, 5)

  // --- all ---
  let r = await done(`${courseAll}-l1`)
  check('all: 1 de 3 não emite', r.ok && !r.certificateCode && (await certCount(courseAll)) === 0)
  r = await done(`${courseAll}-l2`)
  check('all: 2 de 3 não emite', r.ok && !r.certificateCode)
  r = await done(`${courseAll}-l3`)
  const code = r.ok ? r.certificateCode : undefined
  check('all: última aula emite e devolve o código', Boolean(code), code)
  check('all: uma linha em certificate', (await certCount(courseAll)) === 1)

  const [row] = await db.select().from(certificate).where(eq(certificate.courseId, courseAll))
  check('all: fotografia 3/3', row?.lessonsCompleted === 3 && row?.lessonsTotal === 3)

  r = await done(`${courseAll}-l3`)
  check('all: repetir não emite de novo', r.ok && !r.certificateCode && (await certCount(courseAll)) === 1)

  // aula nova depois: o certificado não muda
  await db.insert(lesson).values({
    id: `${courseAll}-l4`,
    courseId: courseAll,
    title: 'Aula 4',
    order: 4,
    published: true,
  })
  const [after] = await db.select().from(certificate).where(eq(certificate.courseId, courseAll))
  check(
    'all: aula nova não altera o certificado já emitido',
    after?.code === code && after?.lessonsTotal === 3,
  )

  const pub = code ? await loadPublicCertificate(code) : null
  check(
    'página pública devolve só nome, curso, data e aulas',
    pub?.holderName === 'Aluna de Teste' &&
      Object.keys(pub ?? {}).sort().join() ===
        'code,courseTitle,holderName,issuedAt,lessonsCompleted,lessonsTotal',
  )

  // --- min-lessons ---
  r = await done(`${courseMin}-l1`)
  check('min-lessons 2: 1 aula não emite', r.ok && !r.certificateCode)
  r = await done(`${courseMin}-l2`)
  check('min-lessons 2: 2 aulas emitem', r.ok && Boolean(r.certificateCode))

  // --- mínimo inalcançável ---
  for (let i = 1; i <= 5; i++) await done(`${courseHigh}-l${i}`)
  check('min-lessons 99 em curso de 5: nada é emitido', (await certCount(courseHigh)) === 0)

  // --- criador ---
  await db
    .insert(enrollment)
    .values({ id: `${courseAll}-ec`, userId: CREATOR, courseId: courseAll, source: 'free' })
    .onConflictDoNothing()
  r = await done(`${courseAll}-l1`, creator)
  check(
    'criador concluindo aula do próprio curso: nenhum certificado',
    r.ok && !r.certificateCode && (await certCount(courseAll, CREATOR)) === 0,
  )
} finally {
  await cleanup()
}

console.log(failures ? `\n🔴 ${failures} falha(s)` : '\n✅ tudo verde')
process.exit(failures ? 1 : 0)
