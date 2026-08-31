import { describe, expect, test, vi } from 'vitest'

// `canManage` lê `MASTER_USER_ID`, que vem de `process.env.VITE_MASTER_USER_ID` no
// momento em que o módulo carrega. Fixamos o valor antes do import.
vi.mock('~/constants/creator', () => ({
  MASTER_USER_ID: 'criador-1',
  ACTIVE_SUBSCRIPTION_STATUSES: ['active', 'trialing'] as const,
}))

const { canManage, canManagePeople } = await import('~/features/admin/canManage')

import type { AuthData } from '~/features/auth/types'

const auth = (id: string, role?: 'admin'): AuthData => ({ id, role })

describe('canManage — quem entra no /admin', () => {
  test('deslogado não entra', () => {
    expect(canManage(null)).toBe(false)
    expect(canManage(undefined)).toBe(false)
  })

  test('usuário comum não entra', () => {
    expect(canManage(auth('alguem'))).toBe(false)
  })

  test('admin entra', () => {
    expect(canManage(auth('alguem', 'admin'))).toBe(true)
  })

  test('o criador entra mesmo sem role de admin', () => {
    // é o caso real: o usuário semeado pelas migrations tem role = 'user', e sem esta
    // regra o dono do produto ficaria trancado para fora da própria área
    expect(canManage(auth('criador-1'))).toBe(true)
  })
})

describe('canManagePeople — quem mexe em usuários', () => {
  test('o criador NÃO mexe na base de usuários', () => {
    // conteúdo é dele; pessoas, não
    expect(canManage(auth('criador-1'))).toBe(true)
    expect(canManagePeople(auth('criador-1'))).toBe(false)
  })

  test('só admin de verdade', () => {
    expect(canManagePeople(auth('alguem', 'admin'))).toBe(true)
    expect(canManagePeople(auth('alguem'))).toBe(false)
    expect(canManagePeople(null)).toBe(false)
  })
})
