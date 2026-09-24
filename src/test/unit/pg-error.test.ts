import { describe, expect, it } from 'vitest'

import { isForeignKeyViolation, isUniqueViolation } from '~/server/api/pgError'

// O Drizzle embrulha o erro do Postgres, então `error.code` no topo é o dele, não o do
// banco. Sem percorrer a cadeia de `cause`, slug duplicado vira 500 em vez de 422 — foi
// o que aconteceu no primeiro teste da rota de cursos.

describe('isUniqueViolation', () => {
  it('reconhece o erro cru do pg', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('🔴 reconhece através do embrulho do Drizzle', () => {
    const wrapped = { name: 'DrizzleQueryError', cause: { code: '23505' } }
    expect(isUniqueViolation(wrapped)).toBe(true)
  })

  it('reconhece aninhado em mais de um nível', () => {
    expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(true)
  })

  it('não confunde com outros erros', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation(new Error('qualquer'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation('23505')).toBe(false)
  })

  it('não entra em laço com cause circular', () => {
    const circular: Record<string, unknown> = {}
    circular.cause = circular
    expect(isUniqueViolation(circular)).toBe(false)
  })

  it('distingue FK de único', () => {
    expect(isForeignKeyViolation({ cause: { code: '23503' } })).toBe(true)
    expect(isForeignKeyViolation({ cause: { code: '23505' } })).toBe(false)
  })
})
