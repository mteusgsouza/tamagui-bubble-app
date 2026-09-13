// Revogar = cancelar no gateway **e** marcar no nosso banco.
//
// Mora fora de `subscriptionActions.ts` por duas razões, e as duas importam:
//
// 1. **Ciclo de import.** `subscriptionActions` ← `registry` ← `manual` →
//    `subscriptionActions`. Funciona por içamento de função, mas é armadilha para quem
//    mexer depois.
// 2. **São duas intenções diferentes, e confundi-las é o bug.** Quando o *webhook* avisa
//    `customer.subscription.deleted`, o gateway já cancelou: ali só se escreve no banco, e
//    chamar o Stripe de volta seria cancelar o que já morreu. Quando o *admin* revoga, o
//    Stripe não sabe de nada — e sem esta função o acesso é cortado enquanto **a cobrança
//    continua todo mês**.
//
// `cancelSubscription` (o write puro) continua existindo para o caminho do webhook.

import { providerById } from '../registry'
import { cancelSubscription, findSubscription } from './subscriptionActions'

export type RevokeResult =
  | { ok: true; canceledAtGateway: boolean }
  | { ok: false; code: 'not-found' | 'gateway-failed'; message: string }

/**
 * Revoga uma assinatura por ação do admin.
 *
 * 🔴 **Gateway primeiro, banco depois.** São dois sistemas sem transação entre eles, então
 * a ordem é a decisão: se o Stripe falhar, **nada** é escrito e o erro sobe para quem
 * clicou. O contrário — marcar `canceled` aqui e falhar lá — deixaria o pior estado
 * possível, o cliente sem acesso e com a fatura chegando.
 *
 * A falha na outra direção (Stripe cancelou, nosso `UPDATE` falhou) é recuperável sozinha:
 * o webhook `customer.subscription.deleted` chega em seguida e corrige.
 */
export async function revokeSubscription(subscriptionId: string): Promise<RevokeResult> {
  const row = await findSubscription({ subscriptionId })
  if (!row) {
    return { ok: false, code: 'not-found', message: 'Assinatura não encontrada.' }
  }

  // o provider é o **da linha**, nunca o `activeProvider()`: assinatura concedida à mão
  // continua sendo `manual` mesmo depois de o Stripe entrar, e mandá-la para o Stripe
  // seria pedir o cancelamento de um id que não existe lá
  const provider = providerById(row.provider)
  let canceledAtGateway = false

  if (provider && row.providerSubscriptionId) {
    try {
      await provider.cancel({
        id: row.id,
        providerSubscriptionId: row.providerSubscriptionId,
      })
      canceledAtGateway = true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro no gateway.'
      console.error(`[billing] falha ao cancelar ${row.id} em ${row.provider}:`, err)
      return {
        ok: false,
        code: 'gateway-failed',
        message:
          `Não consegui cancelar no ${provider.label}: ${message}. ` +
          'O acesso NÃO foi revogado — se tivesse sido, a cobrança seguiria correndo.',
      }
    }
  }

  await cancelSubscription(row.id)
  return { ok: true, canceledAtGateway }
}
