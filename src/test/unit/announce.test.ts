import { describe, expect, it } from 'vitest'

import {
  buildLessonMessage,
  buildPostMessage,
  selectLessonRecipients,
  selectPostRecipients,
} from '~/server/content/announce'

import type { Candidate, SubscriptionRow } from '~/server/content/announce'

const NOW = 1_000_000
const CREATOR = 'creator'
const brand = { appName: 'Bubble', accent: '#e5a33a', accentInk: '#141414' }

const person = (userId: string, over: Partial<Candidate> = {}): Candidate => ({
  userId,
  email: `${userId}@x.com`,
  name: userId,
  banned: false,
  notifyNewPost: true,
  notifyNewLesson: true,
  ...over,
})

const sub = (userId: string, over: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  userId,
  creatorId: CREATOR,
  planId: 'plan-mensal',
  status: 'active',
  currentPeriodEnd: null,
  ...over,
})

const post = { id: 'p1', feedOwnerId: CREATOR, title: 'Título', teaser: 'Isca', requiredPlanId: null }

describe('selectPostRecipients', () => {
  it('avisa assinante ativo', () => {
    const out = selectPostRecipients({
      post,
      candidates: [person('a')],
      subscriptions: [sub('a')],
      now: NOW,
    })
    expect(out.map((p) => p.userId)).toEqual(['a'])
  })

  it('quem desligou o aviso fica de fora', () => {
    const out = selectPostRecipients({
      post,
      candidates: [person('a', { notifyNewPost: false })],
      subscriptions: [sub('a')],
      now: NOW,
    })
    expect(out).toEqual([])
  })

  it('assinatura vencida no meio fica de fora — por status e por data', () => {
    const out = selectPostRecipients({
      post,
      candidates: [person('a'), person('b'), person('c')],
      subscriptions: [
        sub('a', { status: 'expired' }),
        sub('b', { currentPeriodEnd: NOW - 1 }),
        sub('c', { currentPeriodEnd: NOW + 1 }),
      ],
      now: NOW,
    })
    expect(out.map((p) => p.userId)).toEqual(['c'])
  })

  it('post de plano específico só avisa quem tem aquele plano', () => {
    const out = selectPostRecipients({
      post: { ...post, requiredPlanId: 'plan-anual' },
      candidates: [person('a'), person('b')],
      subscriptions: [sub('a'), sub('b', { planId: 'plan-anual' })],
      now: NOW,
    })
    expect(out.map((p) => p.userId)).toEqual(['b'])
  })

  it('banido, sem e-mail, assinante de outro criador e o próprio criador ficam de fora', () => {
    const out = selectPostRecipients({
      post,
      candidates: [
        person('banido', { banned: true }),
        person('sememail', { email: '' }),
        person('outro'),
        person(CREATOR),
      ],
      subscriptions: [
        sub('banido'),
        sub('sememail'),
        sub('outro', { creatorId: 'outro-criador' }),
        sub(CREATOR),
      ],
      now: NOW,
    })
    expect(out).toEqual([])
  })

  it('duas assinaturas da mesma pessoa não duplicam o aviso', () => {
    const out = selectPostRecipients({
      post,
      candidates: [person('a')],
      subscriptions: [sub('a'), sub('a', { planId: 'plan-anual' })],
      now: NOW,
    })
    expect(out).toHaveLength(1)
  })
})

const lesson = {
  id: 'l1',
  title: 'Aula 1',
  courseId: 'c1',
  courseTitle: 'Curso',
  courseSlug: 'curso',
  coursePublished: true,
}

describe('selectLessonRecipients', () => {
  it('avisa matriculado ativo', () => {
    const out = selectLessonRecipients({
      lesson,
      candidates: [person('a')],
      enrollments: [{ userId: 'a', courseId: 'c1', revokedAt: null }],
    })
    expect(out.map((p) => p.userId)).toEqual(['a'])
  })

  it('matrícula revogada, outro curso e aviso de aula desligado ficam de fora', () => {
    const out = selectLessonRecipients({
      lesson,
      candidates: [person('a'), person('b'), person('c', { notifyNewLesson: false })],
      enrollments: [
        { userId: 'a', courseId: 'c1', revokedAt: 5 },
        { userId: 'b', courseId: 'outro', revokedAt: null },
        { userId: 'c', courseId: 'c1', revokedAt: null },
      ],
    })
    expect(out).toEqual([])
  })

  it('assinante sem matrícula NÃO recebe aviso de aula', () => {
    const out = selectLessonRecipients({
      lesson,
      candidates: [person('a')],
      enrollments: [],
    })
    expect(out).toEqual([])
  })

  it('curso despublicado não avisa ninguém', () => {
    const out = selectLessonRecipients({
      lesson: { ...lesson, coursePublished: false },
      candidates: [person('a')],
      enrollments: [{ userId: 'a', courseId: 'c1', revokedAt: null }],
    })
    expect(out).toEqual([])
  })
})

describe('mensagens', () => {
  it('post: título + teaser, e o link do post', () => {
    const m = buildPostMessage({ post, baseUrl: 'https://app.x', brand })
    expect(m.subject).toBe('Novo post: Título')
    expect(m.text).toContain('Isca')
    expect(m.text).toContain('https://app.x/home/feed/p1')
  })

  it('post sem teaser usa só o título; sem título, frase neutra', () => {
    const semTeaser = buildPostMessage({
      post: { ...post, teaser: null },
      baseUrl: 'https://app.x',
      brand,
    })
    expect(semTeaser.text).toContain('Título')
    expect(semTeaser.text).not.toContain('Isca')

    const semNada = buildPostMessage({
      post: { ...post, title: null, teaser: '  ' },
      baseUrl: 'https://app.x',
      brand,
    })
    expect(semNada.subject).toBe('Novo post: Post novo')
  })

  it('aula: só os dois títulos e o link da aula', () => {
    const m = buildLessonMessage({ lesson, baseUrl: 'https://app.x', brand })
    expect(m.subject).toBe('Aula nova em Curso: Aula 1')
    expect(m.text).toContain('https://app.x/home/courses/curso/l1')
  })

  it('escapa HTML do título', () => {
    const m = buildPostMessage({
      post: { ...post, title: '<script>x</script>' },
      baseUrl: 'https://app.x',
      brand,
    })
    expect(m.html).not.toContain('<script>')
    expect(m.html).toContain('&lt;script&gt;')
  })
})
