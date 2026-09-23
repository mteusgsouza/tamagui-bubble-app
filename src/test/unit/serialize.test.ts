import { describe, expect, it } from 'vitest'

import { toEpoch } from '~/server/api/serialize'

// O fuso é a armadilha silenciosa desta migração: nada quebra, nada loga, e o feed passa
// a dizer "há 3 horas" num post recém-criado. O teste existe para travar a suposição de
// que timestamp sem marcador é UTC — a mesma que o Drizzle faz em `mode: 'date'`.

describe('toEpoch', () => {
  it('🔴 string sem fuso é UTC, não hora local', () => {
    // é o formato que o Postgres devolve para `timestamp without time zone`
    expect(toEpoch('2026-09-23 14:02:03.123')).toBe(Date.parse('2026-09-23T14:02:03.123Z'))
  })

  it('aceita o mesmo instante com T no meio', () => {
    expect(toEpoch('2026-09-23T14:02:03.123')).toBe(Date.parse('2026-09-23T14:02:03.123Z'))
  })

  it('respeita o fuso quando ele vem declarado', () => {
    expect(toEpoch('2026-09-23T14:02:03.123Z')).toBe(Date.parse('2026-09-23T14:02:03.123Z'))
    expect(toEpoch('2026-09-23T11:02:03.123-03:00')).toBe(
      Date.parse('2026-09-23T14:02:03.123Z'),
    )
    expect(toEpoch('2026-09-23T14:02:03.123+00')).toBe(
      Date.parse('2026-09-23T14:02:03.123Z'),
    )
  })

  it('não muda o resultado conforme o fuso da máquina', () => {
    // o mesmo valor tem que dar o mesmo epoch na WSL (America/Sao_Paulo) e no container
    // (UTC). Se um dia este teste falhar em CI e passar aqui, é exatamente este bug.
    const semFuso = toEpoch('2026-01-15 12:00:00')
    const comZ = toEpoch('2026-01-15T12:00:00Z')
    expect(semFuso).toBe(comZ)
  })

  it('aceita Date', () => {
    const d = new Date('2026-09-23T14:02:03.123Z')
    expect(toEpoch(d)).toBe(d.getTime())
  })

  it('nulo, vazio e lixo viram null — nunca NaN', () => {
    // `NaN` chegando na tela vira "Invalid Date" no `toLocaleDateString`
    expect(toEpoch(null)).toBeNull()
    expect(toEpoch(undefined)).toBeNull()
    expect(toEpoch('')).toBeNull()
    expect(toEpoch('   ')).toBeNull()
    expect(toEpoch('não é data')).toBeNull()
    expect(toEpoch(new Date('inválido'))).toBeNull()
  })
})

describe('toEpoch — formatos que o Postgres realmente devolve', () => {
  it('🔴 offset de duas casas (+00) — Date.parse sozinho devolve NaN', () => {
    // é o formato de `timestamptz` no Postgres. Sem completar o minuto, todo timestamp
    // voltaria `null` e a tela mostraria data vazia sem erro nenhum.
    expect(Number.isNaN(Date.parse('2026-09-23T14:02:03.123+00'))).toBe(true)
    expect(toEpoch('2026-09-23 14:02:03.123+00')).toBe(
      Date.parse('2026-09-23T14:02:03.123Z'),
    )
  })

  it('offset compacto (-0300) e com dois-pontos dão o mesmo instante', () => {
    const esperado = Date.parse('2026-09-23T14:02:03.123Z')
    expect(toEpoch('2026-09-23 11:02:03.123-0300')).toBe(esperado)
    expect(toEpoch('2026-09-23 11:02:03.123-03:00')).toBe(esperado)
    expect(toEpoch('2026-09-23 11:02:03.123-03')).toBe(esperado)
  })

  it('sem milissegundos', () => {
    expect(toEpoch('2026-09-23 14:02:03')).toBe(Date.parse('2026-09-23T14:02:03Z'))
  })
})
