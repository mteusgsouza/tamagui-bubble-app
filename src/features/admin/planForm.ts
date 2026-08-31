// Regras do formulário de plano, puras e testáveis.
//
// Fora do componente porque é aqui que mora o que pode dar errado: preço digitado em
// vírgula, slug repetido (o Postgres tem unique index em `plan.slug`) e plano sem nome.
// Com Zero, uma mutation que o servidor recusa é aplicada e **revertida** na tela —
// então validar antes é o que impede o formulário de piscar.

import type { Plan } from '~/data/models/plan'

/**
 * "29,90" | "29.90" | "R$ 29,90" → 2990.
 *
 * Aceita vírgula e ponto porque em pt-BR os dois aparecem. Devolve `null` quando não dá
 * para ler um número — o chamador decide o que fazer, em vez de gravar 0 silenciosamente.
 */
export function parsePriceInput(input: string): number | null {
  const cleaned = input.replace(/[^\d,.]/g, '').trim()
  if (!cleaned) return null

  // o último separador é o decimal: "1.234,56" e "1,234.56" caem os dois aqui
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const sep = Math.max(lastComma, lastDot)

  let intPart = cleaned
  let decPart = ''

  if (sep >= 0) {
    const tail = cleaned.slice(sep + 1)
    // 3 dígitos depois do separador é separador de milhar, não decimal: "1.234"
    if (tail.length <= 2) {
      intPart = cleaned.slice(0, sep)
      decPart = tail
    }
  }

  const digits = intPart.replace(/\D/g, '')
  if (!digits && !decPart) return null

  const cents = Number(digits || '0') * 100 + Number(decPart.padEnd(2, '0') || '0')
  return Number.isFinite(cents) ? cents : null
}

/** 2990 → "29,90". O inverso do `parsePriceInput`, para preencher o campo. */
export function formatPriceInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

/** "Plano Anual ⭐" → "plano-anual". O slug vai para a URL e para o unique index. */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export type PlanDraft = {
  id: string
  name: string
  slug: string
  price: string
  interval: 'month' | 'year'
  active: boolean
  order: number
}

export type PlanValidation =
  | { ok: true; values: Omit<Plan, 'currency'> & { currency: string } }
  | { ok: false; message: string }

/** Valida o rascunho contra os planos que já existem. */
export function validatePlan(draft: PlanDraft, existing: Plan[]): PlanValidation {
  const name = draft.name.trim()
  if (!name) return { ok: false, message: 'O plano precisa de um nome.' }

  const slug = slugify(draft.slug || draft.name)
  if (!slug) {
    return { ok: false, message: 'Não consegui gerar um slug a partir desse nome.' }
  }

  // unique index no banco: sem isto a mutation seria aplicada e revertida na cara do usuário
  if (existing.some((p) => p.slug === slug && p.id !== draft.id)) {
    return { ok: false, message: `Já existe um plano com o slug "${slug}".` }
  }

  const priceCents = parsePriceInput(draft.price)
  if (priceCents === null) {
    return { ok: false, message: 'Preço inválido. Use algo como 29,90.' }
  }

  return {
    ok: true,
    values: {
      id: draft.id,
      name,
      slug,
      priceCents,
      currency: 'BRL',
      interval: draft.interval,
      active: draft.active,
      order: draft.order,
    },
  }
}

/** Rótulo curto para a lista: "R$ 29,90 / mês". */
export function planLabel(plan: Pick<Plan, 'priceCents' | 'interval'>): string {
  const price = ((plan.priceCents ?? 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
  return `${price} / ${plan.interval === 'year' ? 'ano' : 'mês'}`
}
