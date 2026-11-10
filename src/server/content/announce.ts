// Quem recebe aviso de conteúdo novo, e o que o aviso diz — **funções puras**.
//
// Recebem linhas e devolvem lista; o job (`announceJob.ts`) só lê do banco, chama isto e
// envia. Zero imports de runtime de propósito: é o que deixa a regra testável sem
// Postgres, no mesmo molde de `contentAccess.ts` e `completion.ts`.
//
// 🔴 **O aviso nunca carrega `postContent.body` nem `lesson.body`.** Os tipos de entrada
// abaixo nem têm esse campo: não dá para vazar o que o código não recebe. Post avisa
// título + `teaser`; aula avisa o nome do curso + título da aula.

export type PostToAnnounce = {
  id: string
  feedOwnerId: string
  title: string | null
  teaser: string | null
  requiredPlanId: string | null
}

export type LessonToAnnounce = {
  id: string
  title: string
  courseId: string
  courseTitle: string
  courseSlug: string
  coursePublished: boolean
}

/** Uma pessoa que *poderia* receber — com o que a seleção precisa saber dela. */
export type Candidate = {
  userId: string
  email: string
  name: string | null
  banned: boolean
  notifyNewPost: boolean
  notifyNewLesson: boolean
}

export type SubscriptionRow = {
  userId: string
  creatorId: string
  planId: string
  status: string
  /** epoch ms; `null` = sem prazo */
  currentPeriodEnd: number | null
}

export type EnrollmentRow = {
  userId: string
  courseId: string
  /** epoch ms; `null` = matrícula ativa */
  revokedAt: number | null
}

const ACTIVE_STATUSES = new Set(['active', 'trialing'])

const subscriptionIsLive = (row: SubscriptionRow, now: number) =>
  ACTIVE_STATUSES.has(row.status) &&
  (row.currentPeriodEnd === null || row.currentPeriodEnd > now)

/** Assinantes ativos do criador que não desligaram o aviso de post. */
export function selectPostRecipients(args: {
  post: PostToAnnounce
  candidates: Candidate[]
  subscriptions: SubscriptionRow[]
  now: number
}): Candidate[] {
  const { post, candidates, subscriptions, now } = args
  const byUser = new Map(candidates.map((c) => [c.userId, c]))
  const seen = new Set<string>()
  const out: Candidate[] = []

  for (const sub of subscriptions) {
    if (sub.creatorId !== post.feedOwnerId) continue
    if (!subscriptionIsLive(sub, now)) continue
    // post de plano específico só avisa quem tem **aquele** plano — o mesmo recorte do gate
    if (post.requiredPlanId && sub.planId !== post.requiredPlanId) continue
    if (seen.has(sub.userId)) continue
    const person = byUser.get(sub.userId)
    if (!person || person.banned || !person.notifyNewPost || !person.email) continue
    // o criador não precisa ser avisado do que ele mesmo publicou
    if (person.userId === post.feedOwnerId) continue
    seen.add(sub.userId)
    out.push(person)
  }
  return out
}

/** Matriculados ativos no curso — **não** todos os assinantes. Curso despublicado não avisa. */
export function selectLessonRecipients(args: {
  lesson: LessonToAnnounce
  candidates: Candidate[]
  enrollments: EnrollmentRow[]
}): Candidate[] {
  const { lesson, candidates, enrollments } = args
  if (!lesson.coursePublished) return []
  const byUser = new Map(candidates.map((c) => [c.userId, c]))
  const seen = new Set<string>()
  const out: Candidate[] = []

  for (const row of enrollments) {
    if (row.courseId !== lesson.courseId || row.revokedAt !== null) continue
    if (seen.has(row.userId)) continue
    const person = byUser.get(row.userId)
    if (!person || person.banned || !person.notifyNewLesson || !person.email) continue
    seen.add(row.userId)
    out.push(person)
  }
  return out
}

export type AnnouncementMessage = {
  subject: string
  text: string
  html: string
}

export type Brand = { appName: string; accent: string; accentInk: string }

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const render = (
  brand: Brand,
  args: { subject: string; heading: string; lines: string[]; cta: string; url: string },
): AnnouncementMessage => {
  const { subject, heading, lines, cta, url } = args
  const text = [heading, ...lines, '', `${cta}: ${url}`, '', `— ${brand.appName}`].join('\n')
  const paragraphs = lines
    .map((l) => `<p style="margin:0 0 12px;color:#333;font-size:15px">${escapeHtml(l)}</p>`)
    .join('')
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 16px;font-size:20px;color:#141414">${escapeHtml(heading)}</h2>
${paragraphs}
<p style="margin:20px 0"><a href="${escapeHtml(url)}" style="background:${brand.accent};color:${brand.accentInk};padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(cta)}</a></p>
<p style="margin:24px 0 0;color:#888;font-size:12px">${escapeHtml(brand.appName)} · Para parar de receber, desligue o aviso em Ajustes.</p>
</div>`
  return { subject, text, html }
}

/** Post: título + `teaser`. Sem `teaser`, só o título; sem título, uma frase neutra. */
export function buildPostMessage(args: {
  post: PostToAnnounce
  baseUrl: string
  brand: Brand
}): AnnouncementMessage {
  const { post, baseUrl, brand } = args
  const title = post.title?.trim() || 'Post novo'
  const teaser = post.teaser?.trim()
  return render(brand, {
    subject: `Novo post: ${title}`,
    heading: title,
    lines: teaser ? [teaser] : ['Saiu um post novo.'],
    cta: 'Abrir o post',
    url: `${baseUrl}/home/feed/${post.id}`,
  })
}

/** Aula: só os dois títulos. */
export function buildLessonMessage(args: {
  lesson: LessonToAnnounce
  baseUrl: string
  brand: Brand
}): AnnouncementMessage {
  const { lesson, baseUrl, brand } = args
  return render(brand, {
    subject: `Aula nova em ${lesson.courseTitle}: ${lesson.title}`,
    heading: lesson.title,
    lines: [`Aula nova no curso ${lesson.courseTitle}.`],
    cta: 'Abrir a aula',
    url: `${baseUrl}/home/courses/${lesson.courseSlug}/${lesson.id}`,
  })
}
