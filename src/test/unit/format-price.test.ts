import { describe, expect, it } from 'vitest'

import {
  formatPrice,
  intervalSuffix,
  planPriceLabel,
  renewalNote,
} from '~/features/billing/formatPrice'

// `Intl` em pt-BR usa espaço não-quebrável entre o símbolo e o número. Comparar com um
// espaço comum faria o teste falhar por um caractere invisível.
const norm = (s: string) => s.replace(/ /g, ' ')

describe('formatPrice', () => {
  it('formata em pt-BR', () => {
    expect(norm(formatPrice(1000))).toBe('R$ 10,00')
    expect(norm(formatPrice(990))).toBe('R$ 9,90')
    expect(norm(formatPrice(0))).toBe('R$ 0,00')
  })

  it('usa vírgula e ponto nos lugares certos', () => {
    // é por isto que a função existe: concatenar à mão erra exatamente aqui
    expect(norm(formatPrice(123456))).toBe('R$ 1.234,56')
  })

  it('não derruba a tela com moeda inválida no banco', () => {
    expect(formatPrice(1000, 'XX')).toContain('10.00')
  })
})

describe('planPriceLabel', () => {
  it('recorrente ganha sufixo de intervalo', () => {
    expect(norm(planPriceLabel({ priceCents: 1000, interval: 'month' }))).toBe(
      'R$ 10,00/mês',
    )
    expect(norm(planPriceLabel({ priceCents: 9900, interval: 'year' }))).toBe(
      'R$ 99,00/ano',
    )
  })

  it('🔴 avulso diz o prazo', () => {
    // sem isto o usuário lê "R$ 10,00" e assume acesso para sempre; 30 dias depois o cron
    // derruba e parece golpe
    expect(norm(planPriceLabel({ priceCents: 1000, interval: 'once', accessDays: 30 }))).toBe(
      'R$ 10,00 · 30 dias',
    )
    expect(norm(planPriceLabel({ priceCents: 1000, interval: 'once', accessDays: 1 }))).toBe(
      'R$ 10,00 · 1 dia',
    )
  })

  it('avulso sem accessDays não inventa prazo', () => {
    expect(norm(planPriceLabel({ priceCents: 1000, interval: 'once' }))).toBe('R$ 10,00')
    expect(
      norm(planPriceLabel({ priceCents: 1000, interval: 'once', accessDays: 0 })),
    ).toBe('R$ 10,00')
  })
})

describe('intervalSuffix e renewalNote', () => {
  it('cobrem os três intervalos', () => {
    expect(intervalSuffix('once')).toBe('')
    expect(renewalNote('once')).toContain('único')
    expect(renewalNote('month')).toContain('mês')
    expect(renewalNote('year')).toContain('ano')
  })
})
