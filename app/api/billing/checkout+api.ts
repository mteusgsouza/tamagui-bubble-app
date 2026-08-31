// POST /api/billing/checkout — começa uma assinatura pelo adapter ativo.
//
// O corpo diz o plano; **quem assina é sempre a sessão**, nunca um `userId` do corpo —
// senão qualquer pessoa logada assinaria em nome de outra.
//
// ⚠️ **O provider `manual` é recusado aqui de propósito.** O `createCheckout` dele
// concede a assinatura na hora (é o que "concessão manual" significa), então expor essa
// rota com `BILLING_PROVIDER=manual` daria assinatura de graça a qualquer um que fizesse
// o POST. Concessão manual passa por `/api/admin/people`, que exige admin.

import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'
import { eq } from 'drizzle-orm'

import { MASTER_USER_ID } from '~/constants/creator'
import { getDb } from '~/database'
import { plan } from '~/database/schema-public'
import { authServer } from '~/features/auth/server/authServer'
import { activeProvider } from '~/features/billing/registry'

import type { Endpoint } from 'one'

const fail = (status: number, code: string, message: string) =>
  Response.json({ error: message, code }, { status })

export const POST: Endpoint = async (request) => {
  const auth = await getAuthDataFromRequest(authServer, request)
  if (!auth?.id) return fail(401, 'unauthenticated', 'Faça login para assinar.')

  const provider = activeProvider()

  if (provider.id === 'manual') {
    return fail(
      501,
      'no-gateway',
      'Ainda não há gateway de pagamento configurado. Peça acesso ao criador.',
    )
  }

  let body: { planId?: unknown; returnUrl?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return fail(400, 'invalid-json', 'Corpo não é JSON.')
  }

  const planId = typeof body.planId === 'string' ? body.planId : ''
  if (!planId) return fail(400, 'missing-plan', 'Informe planId.')

  const db = getDb()
  const [row] = await db
    .select({ id: plan.id, active: plan.active })
    .from(plan)
    .where(eq(plan.id, planId))
    .limit(1)

  if (!row) return fail(404, 'plan-not-found', 'Plano não encontrado.')
  if (!row.active) return fail(422, 'plan-inactive', 'Esse plano não está mais à venda.')

  try {
    const result = await provider.createCheckout({
      userId: auth.id,
      // app de um criador só: `plan` não tem dono, todos são do master
      creatorId: MASTER_USER_ID,
      planId,
      returnUrl: typeof body.returnUrl === 'string' ? body.returnUrl : undefined,
    })
    return Response.json({ provider: provider.id, ...result })
  } catch (err) {
    console.error('[billing] checkout falhou', err)
    return fail(
      500,
      'checkout-failed',
      err instanceof Error ? err.message : 'Não foi possível iniciar a assinatura.',
    )
  }
}
