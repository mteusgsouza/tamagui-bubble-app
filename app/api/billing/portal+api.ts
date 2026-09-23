// POST /api/billing/portal — abre o portal do gateway para o assinante.
//
// É onde ele troca cartão, vê faturas e cancela. Nada disso vira tela no app: seria
// reimplementar pior o que o gateway já hospeda, e o cancelamento feito lá volta pelo
// webhook (`customer.subscription.updated`) sem escrita especial deste lado.
//
// ⚠️ **Quem é o usuário sai sempre da sessão**, nunca do corpo — senão qualquer logado
// abriria o portal de faturamento de outra pessoa.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'

import { authServer } from '~/features/auth/server/authServer'
import { activeProvider } from '~/features/billing/registry'
import { fail } from '~/server/api/respond'

import type { Endpoint } from 'one'

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return fail(401, 'unauthenticated', 'Faça login.')

  const provider = activeProvider()

  // `createPortalSession` é opcional no contrato: o `manual` não tem portal. Recusar aqui
  // é melhor que a tela oferecer um botão que quebra (decisão 18).
  if (!provider.createPortalSession) {
    return fail(
      501,
      'no-portal',
      `O provider ${provider.label} não tem portal de assinatura.`,
    )
  }

  let body: { returnUrl?: unknown } = {}
  try {
    body = (await request.json()) as typeof body
  } catch {
    // corpo vazio é aceitável: `returnUrl` é opcional
  }

  try {
    const result = await provider.createPortalSession({
      userId: auth.id,
      returnUrl: typeof body.returnUrl === 'string' ? body.returnUrl : undefined,
    })
    return Response.json({ provider: provider.id, url: result.url })
  } catch (err) {
    console.error('[billing] portal falhou', err)
    // quem nunca comprou não tem cliente no gateway — 404 e não 500: é estado esperado,
    // não defeito
    return fail(
      404,
      'no-customer',
      'Você ainda não tem assinatura para gerenciar.',
    )
  }
}
