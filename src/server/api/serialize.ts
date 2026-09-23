// Conversão de valor do banco para o que a tela consome.
//
// O contrato com a UI é **epoch em milissegundos**, porque era o que o Zero entregava
// (`number()` nos models) e é o que `timeAgo`, `fullDate`, `asDate` e `courseStats` já
// esperam. Preservar a forma é o que mantém a migração respondível: se uma tela quebrar,
// não foi por causa de data.

/**
 * `timestamp` do Postgres → epoch ms.
 *
 * 🔴 **String sem marcador de fuso é UTC**, e é justamente o caso que engana. As colunas
 * são `timestamp` sem timezone, e `src/database/pgTypes.ts` desliga a interpretação do
 * driver — então o que chega aqui é `2026-09-23 14:02:03.123`, exatamente como o Postgres
 * guardou. `Date.parse` dessa string aplica o fuso **local** do processo: na WSL daqui dá
 * 3 horas de diferença, em produção (UTC) dá certo por acaso. Por isso o `Z` é acrescido
 * à mão, que é a mesma suposição do Drizzle em `mode: 'date'`.
 *
 * Aceita `Date` também porque nem toda coluna passa pelo parser desligado (um
 * `sql<Date>` cru, por exemplo), e porque assim o helper serve para qualquer origem.
 */
export function toEpoch(value: string | Date | null | undefined): number | null {
  if (value == null) return null

  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? null : time
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  // o Postgres separa data e hora por espaço; o `Date.parse` quer `T`
  const iso = trimmed.replace(' ', 'T')

  const zone = /(?:Z|([+-])(\d{2})(?::?(\d{2}))?)$/.exec(iso)

  // sem marcador nenhum: é UTC (ver o comentário acima)
  if (!zone) return parse(`${iso}Z`)

  // ⚠️ `+00` sozinho é o que o Postgres devolve em `timestamptz`, e `Date.parse` responde
  // `NaN` para ele — offset precisa de minuto. Completar é a diferença entre a data certa
  // e um `null` silencioso na tela.
  const [matched, sign, hours, minutes] = zone
  if (!sign) return parse(iso) // terminava em `Z`

  const base = iso.slice(0, -matched.length)
  return parse(`${base}${sign}${hours}:${minutes ?? '00'}`)
}

const parse = (iso: string): number | null => {
  const time = Date.parse(iso)
  return Number.isNaN(time) ? null : time
}

/**
 * O inverso, para escrever no banco. As colunas são `mode: 'string'`, e quem já escreve
 * hoje (`subscriptionActions.ts`) usa `new Date().toISOString()` — mantido igual.
 */
export const nowIso = () => new Date().toISOString()
