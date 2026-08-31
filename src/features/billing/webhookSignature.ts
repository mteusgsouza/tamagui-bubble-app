// Verificação de assinatura de webhook — cripto pura, sem env e sem banco.
//
// Separado do provider de propósito: assim dá para testar sem carregar
// `~/server/env-server`, que exige o ambiente inteiro só para existir.

import { createHmac, timingSafeEqual } from 'node:crypto'

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebhookSignatureError'
  }
}

/**
 * Confere o HMAC-SHA256 hex do corpo cru.
 *
 * ⚠️ **`timingSafeEqual`, não `===`.** Comparar assinatura com igualdade comum vaza,
 * pelo tempo de resposta, quantos bytes iniciais bateram — dá para descobrir a
 * assinatura correta byte a byte.
 */
export function verifyHmac(rawBody: string, signature: string, secret: string) {
  if (!secret) {
    throw new WebhookSignatureError(
      'BILLING_WEBHOOK_SECRET não está definido — o webhook fica fechado até ter segredo.'
    )
  }

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const given = signature.trim().toLowerCase()

  // `timingSafeEqual` exige buffers do mesmo tamanho, senão lança
  if (given.length !== expected.length) {
    throw new WebhookSignatureError('Assinatura inválida.')
  }
  if (!/^[0-9a-f]+$/.test(given)) {
    throw new WebhookSignatureError('Assinatura inválida.')
  }
  if (!timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'))) {
    throw new WebhookSignatureError('Assinatura inválida.')
  }
}

/** O HMAC que o gateway deveria mandar. Usado pelos testes e por `scripts/`. */
export function signPayload(rawBody: string, secret: string) {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}
