// Certificado de conclusão — emissão, consulta do aluno e verificação pública.
//
// Emitir é gravar uma linha (`certificate`); nada aqui é derivado na hora. Ver o schema.

import { and, desc, eq, inArray, sql } from 'drizzle-orm'

import { getDb } from '~/database'
import { certificate, course, lesson, lessonProgress, userPublic } from '~/database/schema-public'
import { isCourseComplete } from '~/features/courses/completion'
import { nowIso, toEpoch } from '~/server/api/serialize'

import type { Viewer } from '~/server/access/viewer'

/** O banco ou uma transação dele. */
type Executor = Pick<ReturnType<typeof getDb>, 'select' | 'insert'>

// base32 sem 0/O e 1/I/L: o código é lido e digitado por gente
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 10

/** 10 caracteres de 31 símbolos: ~49 bits, colisão desprezível; o índice único cobre o resto. */
export function newCertificateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  let code = ''
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  return code
}

/** Formato aceito na URL pública — barra lixo antes de ir ao banco. */
export const isCertificateCode = (value: string) =>
  value.length === CODE_LENGTH && [...value].every((c) => CODE_ALPHABET.includes(c))

type CourseCompletionColumns = Pick<
  typeof course.$inferSelect,
  'id' | 'feedOwnerId' | 'certificateEnabled' | 'completionRule' | 'minLessons'
>

/**
 * Emite o certificado se o curso acabou de ser concluído por este usuário.
 *
 * Chamada **dentro** da transação que gravou o progresso, para a contagem enxergar a aula
 * recém-concluída. Devolve o `code` só quando emitiu agora; repetir é no-op, e quem decide
 * é o índice único `(userId, courseId)` — um `select` antes teria corrida.
 *
 * 🔴 Criador e admin não ganham certificado: passam por cima de todo gate e "concluiriam"
 * o próprio curso só de revisar uma aula.
 */
export async function issueCertificateIfComplete(
  tx: Executor,
  viewer: Viewer,
  courseRow: CourseCompletionColumns,
): Promise<string | null> {
  if (!courseRow.certificateEnabled) return null
  if (viewer.isAdmin || courseRow.feedOwnerId === viewer.id) return null

  // duas agregações, uma query (invariante 12)
  const [counts] = await tx
    .select({
      lessonCount: sql<number>`count(${lesson.id})::int`,
      completedCount: sql<number>`count(${lessonProgress.completedAt})::int`,
    })
    .from(lesson)
    .leftJoin(
      lessonProgress,
      and(eq(lessonProgress.lessonId, lesson.id), eq(lessonProgress.userId, viewer.id)),
    )
    .where(and(eq(lesson.courseId, courseRow.id), eq(lesson.published, true)))

  if (!counts || !isCourseComplete(courseRow, counts)) return null

  const [issued] = await tx
    .insert(certificate)
    .values({
      id: crypto.randomUUID(),
      userId: viewer.id,
      courseId: courseRow.id,
      code: newCertificateCode(),
      issuedAt: nowIso(),
      lessonsCompleted: counts.completedCount,
      lessonsTotal: counts.lessonCount,
    })
    .onConflictDoNothing({ target: [certificate.userId, certificate.courseId] })
    .returning({ code: certificate.code })

  return issued?.code ?? null
}

export type CertificateRef = { code: string; issuedAt: number | null }

/** Os certificados do usuário nos cursos dados — uma query, vira `Map`. */
export async function loadCertificates(
  userId: string,
  courseIds: string[],
): Promise<Map<string, CertificateRef>> {
  const byCourse = new Map<string, CertificateRef>()
  if (!userId || !courseIds.length) return byCourse

  const rows = await getDb()
    .select({
      courseId: certificate.courseId,
      code: certificate.code,
      issuedAt: certificate.issuedAt,
    })
    .from(certificate)
    .where(and(eq(certificate.userId, userId), inArray(certificate.courseId, courseIds)))

  for (const row of rows) {
    byCourse.set(row.courseId, { code: row.code, issuedAt: toEpoch(row.issuedAt) })
  }
  return byCourse
}

export type MyCertificateDTO = {
  code: string
  issuedAt: number | null
  courseTitle: string
  courseSlug: string
}

/** "Meus certificados": uma query, mais recente primeiro. */
export async function loadMyCertificates(userId: string): Promise<MyCertificateDTO[]> {
  if (!userId) return []
  const rows = await getDb()
    .select({
      code: certificate.code,
      issuedAt: certificate.issuedAt,
      courseTitle: course.title,
      courseSlug: course.slug,
    })
    .from(certificate)
    .innerJoin(course, eq(course.id, certificate.courseId))
    .where(eq(certificate.userId, userId))
    .orderBy(desc(certificate.issuedAt))

  return rows.map((row) => ({ ...row, issuedAt: toEpoch(row.issuedAt) }))
}

/**
 * O que a página pública mostra — e **só** isso: nome, curso, data e aulas.
 * Sem e-mail e sem id interno.
 */
export type PublicCertificateDTO = {
  code: string
  holderName: string
  courseTitle: string
  issuedAt: number | null
  lessonsCompleted: number
  lessonsTotal: number
}

export async function loadPublicCertificate(
  code: string,
): Promise<PublicCertificateDTO | null> {
  if (!isCertificateCode(code)) return null

  const [row] = await getDb()
    .select({
      code: certificate.code,
      issuedAt: certificate.issuedAt,
      lessonsCompleted: certificate.lessonsCompleted,
      lessonsTotal: certificate.lessonsTotal,
      courseTitle: course.title,
      holderName: userPublic.name,
    })
    .from(certificate)
    .innerJoin(course, eq(course.id, certificate.courseId))
    .innerJoin(userPublic, eq(userPublic.id, certificate.userId))
    .where(eq(certificate.code, code))
    .limit(1)

  if (!row) return null
  return {
    code: row.code,
    holderName: row.holderName?.trim() || 'Aluno',
    courseTitle: row.courseTitle,
    issuedAt: toEpoch(row.issuedAt),
    lessonsCompleted: row.lessonsCompleted,
    lessonsTotal: row.lessonsTotal,
  }
}
