import { describe, expect, it } from 'vitest'

import {
  canSeeComment,
  canSeePost,
  courseAccess,
  lessonAccess,
  postAccess,
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
  ...over,
})

/** Os seis visitantes que importam. */
const DONO = viewer({ id: CRIADOR })
const ADMIN = viewer({ id: 'admin-1', isAdmin: true })
const ESTRANHO = viewer({ id: 'u-estranho' })
const ASSINANTE = viewer({
  id: 'u-assina',
  creators: new Set([CRIADOR]),
  plans: new Set([`${CRIADOR}:${MENSAL}`]),
})
const ASSINANTE_ANUAL = viewer({
  id: 'u-anual',
  creators: new Set([CRIADOR]),
  plans: new Set([`${CRIADOR}:${ANUAL}`]),
})
/** assina OUTRO criador — não pode herdar acesso a este */
const ASSINA_OUTRO = viewer({
  id: 'u-outro',
  creators: new Set(['creator-2']),
  plans: new Set([`creator-2:${MENSAL}`]),
})

const post = (over: Record<string, unknown> = {}) => ({
  feedOwnerId: CRIADOR,
  visibility: 'subscribers',
  requiredPlanId: null,
  published: true,
  deleted: false,
  ...over,
}) as Parameters<typeof postAccess>[1]

const course = (over: Record<string, unknown> = {}) => ({
  feedOwnerId: CRIADOR,
  visibility: 'subscribers',
  requiredPlanId: null,
  published: true,
  ...over,
}) as Parameters<typeof courseAccess>[1]

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

describe('courseAccess', () => {
  it('segue a mesma regra do post', () => {
    expect(courseAccess(ESTRANHO, course({ visibility: 'public' })).allowed).toBe(true)
    expect(courseAccess(ESTRANHO, course()).allowed).toBe(false)
    expect(courseAccess(ASSINANTE, course()).allowed).toBe(true)
    expect(courseAccess(ASSINANTE, course({ requiredPlanId: ANUAL })).allowed).toBe(false)
    expect(courseAccess(ASSINANTE_ANUAL, course({ requiredPlanId: ANUAL })).allowed).toBe(true)
  })

  it('curso despublicado só para dono e admin', () => {
    const rascunho = course({ published: false, visibility: 'public' })
    expect(courseAccess(ESTRANHO, rascunho).allowed).toBe(false)
    expect(courseAccess(DONO, rascunho).allowed).toBe(true)
  })
})

describe('lessonAccess', () => {
  const aula = (over: Record<string, unknown> = {}) => ({
    published: true,
    freePreview: false,
    ...over,
  })

  it('aula de curso liberado abre', () => {
    expect(lessonAccess(ASSINANTE, aula(), course()).allowed).toBe(true)
  })

  it('aula de curso pago fecha para quem não assina', () => {
    expect(lessonAccess(ESTRANHO, aula(), course()).allowed).toBe(false)
  })

  it('amostra grátis abre mesmo sem assinatura', () => {
    expect(lessonAccess(ESTRANHO, aula({ freePreview: true }), course()).allowed).toBe(true)
  })

  it('🔴 amostra grátis NÃO fura curso despublicado', () => {
    const escondido = course({ published: false })
    expect(lessonAccess(ESTRANHO, aula({ freePreview: true }), escondido).allowed).toBe(false)
  })

  it('aula despublicada fecha, mesmo em curso liberado', () => {
    expect(lessonAccess(ASSINANTE, aula({ published: false }), course()).allowed).toBe(false)
  })

  it('dono vê aula despublicada de curso despublicado', () => {
    const res = lessonAccess(DONO, aula({ published: false }), course({ published: false }))
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
