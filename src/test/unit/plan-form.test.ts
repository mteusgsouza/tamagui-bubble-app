import { describe, expect, it } from 'vitest'

import {
  formatPriceInput,
  parsePriceInput,
  planLabel,
  slugify,
  validatePlan,
} from '~/features/admin/planForm'

import type { PlanDraft } from '~/features/admin/planForm'

const draft = (over: Partial<PlanDraft> = {}): PlanDraft => ({
  id: 'plan-1',
  name: 'Mensal',
  slug: 'mensal',
  price: '29,90',
  interval: 'month',
  active: true,
  order: 0,
  ...over,
})

const existing = [
  { id: 'plan-9', slug: 'anual', name: 'Anual', priceCents: 29900, interval: 'year' },
] as any[]

describe('parsePriceInput', () => {
  it('lê vírgula decimal', () => {
    expect(parsePriceInput('29,90')).toBe(2990)
  })

  it('lê ponto decimal', () => {
    expect(parsePriceInput('29.90')).toBe(2990)
  })

  it('ignora o símbolo da moeda', () => {
    expect(parsePriceInput('R$ 29,90')).toBe(2990)
  })

  it('aceita valor inteiro', () => {
    expect(parsePriceInput('30')).toBe(3000)
  })

  it('trata 3 dígitos depois do separador como milhar, não decimal', () => {
    expect(parsePriceInput('1.234')).toBe(123400)
    expect(parsePriceInput('1.234,56')).toBe(123456)
  })

  it('completa uma casa decimal só', () => {
    expect(parsePriceInput('29,9')).toBe(2990)
  })

  it('devolve null quando não há número — nunca 0 silencioso', () => {
    expect(parsePriceInput('')).toBeNull()
    expect(parsePriceInput('grátis')).toBeNull()
  })

  it('aceita zero explícito', () => {
    expect(parsePriceInput('0')).toBe(0)
  })

  it('é o inverso de formatPriceInput', () => {
    expect(parsePriceInput(formatPriceInput(12345))).toBe(12345)
  })
})

describe('slugify', () => {
  it('tira acento e espaço', () => {
    expect(slugify('Assinatura Anual')).toBe('assinatura-anual')
    expect(slugify('Plano Básico')).toBe('plano-basico')
  })

  it('não deixa hífen nas pontas', () => {
    expect(slugify('  Plano!  ')).toBe('plano')
  })

  it('devolve vazio quando não sobra nada', () => {
    expect(slugify('⭐⭐')).toBe('')
  })
})

describe('validatePlan', () => {
  it('aceita um plano completo', () => {
    const result = validatePlan(draft(), existing)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.values.priceCents).toBe(2990)
      expect(result.values.currency).toBe('BRL')
      expect(result.values.slug).toBe('mensal')
    }
  })

  it('recusa plano sem nome', () => {
    const result = validatePlan(draft({ name: '  ' }), existing)
    expect(result.ok).toBe(false)
  })

  it('recusa preço ilegível', () => {
    const result = validatePlan(draft({ price: 'de graça' }), existing)
    expect(result).toMatchObject({ ok: false })
  })

  it('recusa slug repetido — o Postgres tem unique index', () => {
    const result = validatePlan(draft({ slug: 'anual' }), existing)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('anual')
  })

  it('deixa o próprio plano manter o slug ao editar', () => {
    const result = validatePlan(draft({ id: 'plan-9', slug: 'anual' }), existing)
    expect(result.ok).toBe(true)
  })

  it('deriva o slug do nome quando o campo está vazio', () => {
    const result = validatePlan(draft({ slug: '' , name: 'Plano Vip' }), existing)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.values.slug).toBe('plano-vip')
  })
})

describe('planLabel', () => {
  it('mostra preço e período', () => {
    expect(planLabel({ priceCents: 2990, interval: 'month' } as any)).toContain('mês')
    expect(planLabel({ priceCents: 29900, interval: 'year' } as any)).toContain('ano')
  })
})
