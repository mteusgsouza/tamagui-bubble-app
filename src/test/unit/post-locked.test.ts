import { describe, expect, it } from 'vitest'

import { isPostLocked } from '~/features/feed/types'

describe('isPostLocked', () => {
  it('bloqueado quando o servidor não sincronizou postContent', () => {
    // é o único sinal que existe: `canAccessPostContent` recusou a linha
    expect(isPostLocked({})).toBe(true)
    expect(isPostLocked({ content: null })).toBe(true)
    expect(isPostLocked({ content: undefined })).toBe(true)
  })

  it('liberado quando a linha chegou', () => {
    expect(isPostLocked({ content: { body: 'texto' } })).toBe(false)
  })

  it('🔴 corpo vazio NÃO é bloqueado — a linha existe', () => {
    // um post de foto ou áudio pode não ter texto nenhum. Se a checagem fosse sobre o
    // `body` em vez do objeto `content`, todo post sem texto apareceria com paywall para
    // quem já pagou.
    expect(isPostLocked({ content: { body: '' } })).toBe(false)
    expect(isPostLocked({ content: { body: null } })).toBe(false)
    expect(isPostLocked({ content: {} })).toBe(false)
  })
})
