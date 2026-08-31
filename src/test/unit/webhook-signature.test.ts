import { describe, expect, it } from 'vitest'

import {
  signPayload,
  verifyHmac,
  WebhookSignatureError,
} from '~/features/billing/webhookSignature'

const SECRET = 'segredo-de-teste'
const BODY = JSON.stringify({ type: 'payment.succeeded', amountCents: 2990 })

describe('verifyHmac', () => {
  it('aceita a assinatura correta', () => {
    expect(() => verifyHmac(BODY, signPayload(BODY, SECRET), SECRET)).not.toThrow()
  })

  it('aceita assinatura em maiúsculas', () => {
    const sig = signPayload(BODY, SECRET).toUpperCase()
    expect(() => verifyHmac(BODY, sig, SECRET)).not.toThrow()
  })

  it('recusa corpo alterado — é o ponto todo', () => {
    const sig = signPayload(BODY, SECRET)
    const adulterado = JSON.stringify({ type: 'payment.succeeded', amountCents: 1 })
    expect(() => verifyHmac(adulterado, sig, SECRET)).toThrow(WebhookSignatureError)
  })

  it('recusa assinatura feita com outro segredo', () => {
    const sig = signPayload(BODY, 'outro-segredo')
    expect(() => verifyHmac(BODY, sig, SECRET)).toThrow(WebhookSignatureError)
  })

  it('recusa assinatura de tamanho errado sem estourar no timingSafeEqual', () => {
    expect(() => verifyHmac(BODY, 'abc', SECRET)).toThrow(WebhookSignatureError)
  })

  it('recusa assinatura que não é hex', () => {
    const sig = 'z'.repeat(64)
    expect(() => verifyHmac(BODY, sig, SECRET)).toThrow(WebhookSignatureError)
  })

  it('recusa assinatura vazia', () => {
    expect(() => verifyHmac(BODY, '', SECRET)).toThrow(WebhookSignatureError)
  })

  it('fica fechado quando não há segredo configurado', () => {
    expect(() => verifyHmac(BODY, signPayload(BODY, ''), '')).toThrow(
      /não está definido/
    )
  })
})
