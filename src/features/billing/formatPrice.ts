// Preço em texto — **função pura**, sem env, sem banco, sem Zero.
//
// Existe para não haver `toFixed(2)` espalhado pela tela: moeda e intervalo saem do dado,
// nunca de string escrita à mão no componente. Preço errado na vitrine é o tipo de bug que
// só aparece na fatura do cliente.

/** Intervalos que `plan.interval` aceita. `once` é compra avulsa, que não renova. */
export type PlanInterval = 'month' | 'year' | 'once'

/**
 * `1000` → `R$ 10,00`.
 *
 * ⚠️ `Intl.NumberFormat` e não concatenação: em pt-BR o separador é vírgula e o milhar é
 * ponto, e escrever isso à mão erra em R$ 1.234,56.
 */
export function formatPrice(priceCents: number, currency = 'BRL'): string {
  const value = (priceCents ?? 0) / 100
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
    }).format(value)
  } catch {
    // moeda inválida no banco não pode derrubar a tela de preços
    return `${currency} ${value.toFixed(2)}`
  }
}

/** `month` → `/mês`. O avulso não tem sufixo: o prazo dele é dito à parte. */
export function intervalSuffix(interval: PlanInterval): string {
  switch (interval) {
    case 'month':
      return '/mês'
    case 'year':
      return '/ano'
    case 'once':
      return ''
  }
}

/**
 * A linha de preço inteira: `R$ 10,00/mês`, `R$ 10,00/ano` ou `R$ 10,00 · 30 dias`.
 *
 * O avulso **precisa** dizer o prazo. Sem isso o usuário lê "R$ 10,00" e assume acesso
 * para sempre — e depois de 30 dias o cron derruba, o que pareceria golpe.
 */
export function planPriceLabel(plan: {
  priceCents: number
  currency?: string | null
  interval: PlanInterval
  accessDays?: number | null
}): string {
  const price = formatPrice(plan.priceCents, plan.currency ?? 'BRL')

  if (plan.interval !== 'once') return `${price}${intervalSuffix(plan.interval)}`

  const days = plan.accessDays ?? 0
  if (days <= 0) return price
  return `${price} · ${days} ${days === 1 ? 'dia' : 'dias'}`
}

/** Como a cobrança se repete, em uma frase. Vai abaixo do preço, em texto miúdo. */
export function renewalNote(interval: PlanInterval): string {
  switch (interval) {
    case 'month':
      return 'Renova todo mês. Cancele quando quiser.'
    case 'year':
      return 'Renova todo ano. Cancele quando quiser.'
    case 'once':
      return 'Pagamento único. Não renova automaticamente.'
  }
}
