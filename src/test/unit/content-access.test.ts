import { describe, expect, it } from 'vitest'

import {
  canSeeComment,
  canSeePost,
  courseAccess,
  courseLockReason,
  enrollmentSource,
  lessonAccess,
  postAccess,
  subscriberAccessAllows,
  tierAllows,
} from '~/server/access/contentAccess'

import type { Viewer } from '~/server/access/viewer'

// A cobertura que o paywall nunca teve.
//
// Com o Zero, estas regras eram expressões passadas para o motor de sync: só dava para
// exercitá-las com banco, replica e sessão de pé — então ninguém exercitava. O conteúdo
// pago vazou uma vez exatamente aqui, e o defeito só apareceu porque um humano abriu a
// tela. Agora são funções puras, e cada combinação vira uma linha.

const CRIADOR = 'creator-1'
const ANUAL = 'plan-anual'
const MENSAL = 'plan-mensal'

const viewer = (over: Partial<Viewer> = {}): Viewer => ({
  id: 'someone',
  isAdmin: false,
  creators: new Set(),
  plans: new Set(),
  subscriptions: new Map(),
  ...over,
})

/** A assinatura ativa ao criador, começada em `startedAt` (epoch ms). */
const assina = (planId: string, startedAt = ASSINOU) => ({
  creators: new Set([CRIADOR]),
  plans: new Set([`${CRIADOR}:${planId}`]),
  subscriptions: new Map([[CRIADOR, { id: 'sub-1', planId, startedAt }]]),
})

/** Os seis visitantes que importam. */
const ASSINOU = Date.parse('2026-03-01T00:00:00Z')

const DONO = viewer({ id: CRIADOR })
const ADMIN = viewer({ id: 'admin-1', isAdmin: true })
const ESTRANHO = viewer({ id: 'u-estranho' })
const ASSINANTE = viewer({ id: 'u-assina', ...assina(MENSAL) })
const ASSINANTE_ANUAL = viewer({ id: 'u-anual', ...assina(ANUAL) })
/** assina OUTRO criador — não pode herdar acesso a este */
const ASSINA_OUTRO = viewer({
  id: 'u-outro',
  creators: new Set(['creator-2']),
  plans: new Set([`creator-2:${MENSAL}`]),
  subscriptions: new Map([['creator-2', { id: 'sub-2', planId: MENSAL, startedAt: ASSINOU }]]),
})

const post = (over: Record<string, unknown> = {}) => ({
  feedOwnerId: CRIADOR,
  visibility: 'subscribers',
  requiredPlanId: null,
  published: true,
  deleted: false,
  ...over,
}) as Parameters<typeof postAccess>[1]

/** publicado em junho — depois de a assinatura de março começar */
const course = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  feedOwnerId: CRIADOR,
  visibility: 'subscribers',
  requiredPlanId: null,
  published: true,
  publishedAt: '2026-06-01 00:00:00',
  subscriberAccess: 'included',
  ...over,
}) as Parameters<typeof courseAccess>[1]

const SEM_MATRICULA: ReadonlySet<string> = new Set()
const MATRICULADO: ReadonlySet<string> = new Set(['c1'])

describe('tierAllows', () => {
  it('público libera para qualquer um', () => {
    expect(tierAllows(ESTRANHO, post({ visibility: 'public' }))).toBe(true)
  })

  it('sem plano exigido, qualquer assinatura ativa do criador libera', () => {
    expect(tierAllows(ASSINANTE, post())).toBe(true)
    expect(tierAllows(ASSINANTE_ANUAL, post())).toBe(true)
    expect(tierAllows(ESTRANHO, post())).toBe(false)
  })

  it('🔴 com plano exigido, a assinatura tem que ser DAQUELE plano', () => {
    const exigeAnual = post({ requiredPlanId: ANUAL })
    // o assinante do Mensal assina o criador, mas não este plano
    expect(tierAllows(ASSINANTE, exigeAnual)).toBe(false)
    expect(tierAllows(ASSINANTE_ANUAL, exigeAnual)).toBe(true)
  })

  it('🔴 assinar OUTRO criador não libera nada aqui', () => {
    expect(tierAllows(ASSINA_OUTRO, post())).toBe(false)
    expect(tierAllows(ASSINA_OUTRO, post({ requiredPlanId: MENSAL }))).toBe(false)
  })
})

describe('canSeePost — a vitrine', () => {
  it('post publicado existe para todo mundo, inclusive quem não paga', () => {
    // é o ponto da Fase 12: sem isto o feed fica vazio e ninguém tem motivo para assinar
    expect(canSeePost(ESTRANHO, post())).toBe(true)
  })

  it('rascunho e apagado só aparecem para o dono e o admin', () => {
    for (const p of [post({ published: false }), post({ deleted: true })]) {
      expect(canSeePost(ESTRANHO, p)).toBe(false)
      expect(canSeePost(ASSINANTE, p)).toBe(false)
      expect(canSeePost(DONO, p)).toBe(true)
      expect(canSeePost(ADMIN, p)).toBe(true)
    }
  })
})

describe('postAccess — o produto', () => {
  it('dono e admin passam por cima de tudo', () => {
    const trancado = post({ requiredPlanId: ANUAL, published: false, deleted: true })
    expect(postAccess(DONO, trancado).allowed).toBe(true)
    expect(postAccess(ADMIN, trancado).allowed).toBe(true)
  })

  it('público libera sem assinatura', () => {
    expect(postAccess(ESTRANHO, post({ visibility: 'public' })).allowed).toBe(true)
  })

  it('de assinante barra quem não assina', () => {
    const res = postAccess(ESTRANHO, post())
    expect(res.allowed).toBe(false)
    expect(res.allowed === false && res.reason).toBe('needs-subscription')
  })

  it('🔴 plano errado devolve needs-plan, não needs-subscription', () => {
    // as duas telas são diferentes: "assine" contra "seu plano não inclui este post"
    const res = postAccess(ASSINANTE, post({ requiredPlanId: ANUAL }))
    expect(res.allowed).toBe(false)
    expect(res.allowed === false && res.reason).toBe('needs-plan')
  })

  it('🔴 um post visível NÃO implica um post liberado', () => {
    // é a confusão que vazou conteúdo pago: o card aparece, o corpo não pode vir junto
    const pago = post()
    expect(canSeePost(ESTRANHO, pago)).toBe(true)
    expect(postAccess(ESTRANHO, pago).allowed).toBe(false)
  })
})

describe('subscriberAccessAllows', () => {
  const T = Date.parse('2026-03-01T00:00:00Z')

  it('included: qualquer assinatura ativa cobre, sem assinatura não', () => {
    const c = { subscriberAccess: 'included' as const, publishedAt: 1 }
    expect(subscriberAccessAllows(c, { startedAt: T })).toBe(true)
    expect(subscriberAccessAllows(c, null)).toBe(false)
  })

  it('none: nem assinando', () => {
    const c = { subscriberAccess: 'none' as const, publishedAt: 1 }
    expect(subscriberAccessAllows(c, { startedAt: T })).toBe(false)
    expect(subscriberAccessAllows(c, null)).toBe(false)
  })

  it('since-subscription: só o que saiu depois da assinatura', () => {
    const depois = { subscriberAccess: 'since-subscription' as const, publishedAt: T + 1 }
    const antes = { subscriberAccess: 'since-subscription' as const, publishedAt: T - 1 }
    expect(subscriberAccessAllows(depois, { startedAt: T })).toBe(true)
    expect(subscriberAccessAllows(antes, { startedAt: T })).toBe(false)
  })

  it('🔴 publicado no mesmo instante da assinatura libera (>=)', () => {
    const c = { subscriberAccess: 'since-subscription' as const, publishedAt: T }
    expect(subscriberAccessAllows(c, { startedAt: T })).toBe(true)
  })

  it('🔴 publishedAt nulo NEGA, nunca libera', () => {
    const c = { subscriberAccess: 'since-subscription' as const, publishedAt: null }
    expect(subscriberAccessAllows(c, { startedAt: T })).toBe(false)
  })

  it('sem assinatura nega em qualquer modo', () => {
    for (const subscriberAccess of ['included', 'since-subscription', 'none'] as const) {
      expect(subscriberAccessAllows({ subscriberAccess, publishedAt: T }, null)).toBe(false)
    }
  })
})

describe('enrollmentSource', () => {
  it('curso público matricula como free, até para estranho', () => {
    expect(enrollmentSource(ESTRANHO, course({ visibility: 'public' }))).toBe('free')
  })

  it('assinante de plano que serve matricula como subscription', () => {
    expect(enrollmentSource(ASSINANTE, course())).toBe('subscription')
  })

  it('plano errado não matricula', () => {
    expect(enrollmentSource(ASSINANTE, course({ requiredPlanId: ANUAL }))).toBeNull()
    expect(enrollmentSource(ASSINANTE_ANUAL, course({ requiredPlanId: ANUAL }))).toBe('subscription')
  })

  it('estranho e quem assina outro criador não matriculam', () => {
    expect(enrollmentSource(ESTRANHO, course())).toBeNull()
    expect(enrollmentSource(ASSINA_OUTRO, course())).toBeNull()
  })

  it('since-subscription: curso anterior à assinatura não matricula', () => {
    const antigo = course({
      subscriberAccess: 'since-subscription',
      publishedAt: '2026-01-10 00:00:00',
    })
    const novo = course({ subscriberAccess: 'since-subscription' })
    expect(enrollmentSource(ASSINANTE, antigo)).toBeNull()
    expect(enrollmentSource(ASSINANTE, novo)).toBe('subscription')
  })

  it('none nunca matricula por assinatura', () => {
    expect(enrollmentSource(ASSINANTE, course({ subscriberAccess: 'none' }))).toBeNull()
  })
})

describe('courseLockReason', () => {
  it('quem tem direito mas não se matriculou: needs-enrollment', () => {
    expect(courseLockReason(ASSINANTE, course())).toBe('needs-enrollment')
  })

  it('sem assinatura: needs-subscription', () => {
    expect(courseLockReason(ESTRANHO, course())).toBe('needs-subscription')
    expect(
      courseLockReason(ESTRANHO, course({ subscriberAccess: 'since-subscription' })),
    ).toBe('needs-subscription')
  })

  it('plano errado: needs-plan (comportamento de sempre)', () => {
    expect(courseLockReason(ASSINANTE, course({ requiredPlanId: ANUAL }))).toBe('needs-plan')
  })

  it('assina e o curso é none: needs-purchase', () => {
    expect(courseLockReason(ASSINANTE, course({ subscriberAccess: 'none' }))).toBe('needs-purchase')
  })

  it('assina e o curso veio antes da assinatura: needs-purchase', () => {
    const antigo = course({
      subscriberAccess: 'since-subscription',
      publishedAt: '2026-01-10 00:00:00',
    })
    expect(courseLockReason(ASSINANTE, antigo)).toBe('needs-purchase')
  })

  it('sem assinatura e curso none: needs-purchase (compra avulsa)', () => {
    expect(courseLockReason(ESTRANHO, course({ subscriberAccess: 'none' }))).toBe('needs-purchase')
  })
})

describe('courseAccess', () => {
  it('curso público abre sem matrícula', () => {
    expect(courseAccess(ESTRANHO, course({ visibility: 'public' }), SEM_MATRICULA).allowed).toBe(true)
  })

  it('🔴 assinar não basta: sem matrícula o curso fica fechado', () => {
    const res = courseAccess(ASSINANTE, course(), SEM_MATRICULA)
    expect(res).toEqual({ allowed: false, reason: 'needs-enrollment' })
  })

  it('com matrícula ativa abre', () => {
    expect(courseAccess(ASSINANTE, course(), MATRICULADO).allowed).toBe(true)
  })

  it('matrícula vale mesmo sem assinatura (compra e concessão)', () => {
    expect(courseAccess(ESTRANHO, course(), MATRICULADO).allowed).toBe(true)
  })

  it('matrícula em OUTRO curso não abre este', () => {
    expect(courseAccess(ESTRANHO, course(), new Set(['c2'])).allowed).toBe(false)
  })

  it('curso despublicado só para dono e admin, mesmo matriculado', () => {
    const rascunho = course({ published: false })
    expect(courseAccess(ESTRANHO, rascunho, MATRICULADO).allowed).toBe(false)
    expect(courseAccess(DONO, rascunho, SEM_MATRICULA).allowed).toBe(true)
    expect(courseAccess(ADMIN, rascunho, SEM_MATRICULA).allowed).toBe(true)
  })

  it('dono e admin abrem sem matrícula', () => {
    expect(courseAccess(DONO, course(), SEM_MATRICULA).allowed).toBe(true)
    expect(courseAccess(ADMIN, course(), SEM_MATRICULA).allowed).toBe(true)
  })
})

describe('lessonAccess', () => {
  const aula = (over: Record<string, unknown> = {}) => ({
    published: true,
    freePreview: false,
    ...over,
  })

  it('aula de curso com matrícula abre', () => {
    expect(lessonAccess(ASSINANTE, aula(), course(), MATRICULADO).allowed).toBe(true)
  })

  it('🔴 assinante sem matrícula não abre a aula', () => {
    expect(lessonAccess(ASSINANTE, aula(), course(), SEM_MATRICULA).allowed).toBe(false)
  })

  it('aula de curso pago fecha para quem não assina', () => {
    expect(lessonAccess(ESTRANHO, aula(), course(), SEM_MATRICULA).allowed).toBe(false)
  })

  it('amostra grátis abre mesmo sem assinatura nem matrícula', () => {
    expect(
      lessonAccess(ESTRANHO, aula({ freePreview: true }), course(), SEM_MATRICULA).allowed,
    ).toBe(true)
  })

  it('🔴 amostra grátis NÃO fura curso despublicado', () => {
    const escondido = course({ published: false })
    expect(
      lessonAccess(ESTRANHO, aula({ freePreview: true }), escondido, SEM_MATRICULA).allowed,
    ).toBe(false)
  })

  it('aula despublicada fecha, mesmo em curso liberado', () => {
    expect(
      lessonAccess(ASSINANTE, aula({ published: false }), course(), MATRICULADO).allowed,
    ).toBe(false)
  })

  it('dono vê aula despublicada de curso despublicado', () => {
    const res = lessonAccess(
      DONO,
      aula({ published: false }),
      course({ published: false }),
      SEM_MATRICULA,
    )
    expect(res.allowed).toBe(true)
  })
})

describe('canSeeComment', () => {
  it('apagado nunca aparece, nem para o dono', () => {
    expect(canSeeComment(DONO, { deleted: true }, post())).toBe(false)
  })

  it('segue o acesso ao post', () => {
    expect(canSeeComment(ESTRANHO, { deleted: false }, post())).toBe(false)
    expect(canSeeComment(ASSINANTE, { deleted: false }, post())).toBe(true)
    expect(canSeeComment(ESTRANHO, { deleted: false }, post({ visibility: 'public' }))).toBe(true)
  })
})
