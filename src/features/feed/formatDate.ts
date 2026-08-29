// Datas do feed, sem dependência de lib.
//
// Os timestamps do Zero são epoch em ms (`number()`), não string — as colunas do
// Postgres são `timestamp` mas a replicação entrega número. Todas as funções aqui
// aceitam `null`/`undefined` porque `publishedAt` é opcional em rascunho.

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "agora" · "há 12 min" · "há 2 h" · "ontem" · "há 5 dias" · "14 de agosto" */
export function timeAgo(epochMs?: number | null) {
  if (!epochMs) return ''

  const diff = Date.now() - epochMs
  if (diff < MINUTE) return 'agora'
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`
  if (diff < DAY) return `há ${Math.floor(diff / HOUR)} h`

  const days = Math.floor(diff / DAY)
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`

  return new Date(epochMs).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  })
}

/**
 * "14 de agosto, 09:12" — a data completa da tela de detalhe. No card o relativo diz
 * mais ("há 2 h"); aberto o post, a data exata é que importa.
 */
export function fullDate(epochMs?: number | null) {
  if (!epochMs) return ''
  const date = new Date(epochMs)
  const day = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
  const time = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${day}, ${time}`
}

/** Rótulo de quem pode ver o post. */
export const visibilityLabel = (visibility: string) =>
  visibility === 'public' ? 'aberto a todos' : 'assinantes'

/** "1 comentário" / "12 comentários" — plural sem lib de i18n. */
export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`
