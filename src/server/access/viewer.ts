// Quem está pedindo, e o que ele já comprou — resolvido uma vez por requisição.
//
// Substitui o que o Zero fazia por baixo: cada permission dele disparava um `EXISTS`
// correlacionado **por linha** contra `subscription`. Vinte posts no feed viravam vinte
// subconsultas de assinatura, e é de onde vinha boa parte do "Slow query materialization".
//
// Aqui a assinatura é lida **uma vez**, vira dois `Set`, e a decisão de cada linha passa
// a ser comparação em memória contra colunas que a linha já tem (`feedOwnerId`,
// `requiredPlanId`). É exatamente o que `src/server/media/mediaAccess.ts` já fazia para
// os bytes — este módulo generaliza para todo o conteúdo.

import { and, eq, inArray } from 'drizzle-orm'

import { ACTIVE_SUBSCRIPTION_STATUSES, MASTER_USER_ID } from '~/constants/creator'
import { getDb } from '~/database'
import { user } from '~/database/schema-private'
import { subscription } from '~/database/schema-public'

import type { AuthData } from '~/features/auth/types'

const ACTIVE = [...ACTIVE_SUBSCRIPTION_STATUSES]

export type Viewer = {
  id: string
  /** 🔴 lido do Postgres, **nunca** da claim do JWT — ver abaixo. */
  isAdmin: boolean
  /** criadores com assinatura ativa, em qualquer plano */
  creators: Set<string>
  /** pares `criador:plano` das assinaturas ativas — é o que `requiredPlanId` exige */
  plans: Set<string>
}

/**
 * A role, lida do Postgres.
 *
 * ⚠️ **Nunca da claim do JWT.** O token do Takeout dura 3 anos (`authServer.ts`), então
 * a claim `role` fica congelada: promover alguém a admin não teria efeito até o token
 * renovar. Um lugar só decide isso — era o `requireAdmin` local de
 * `app/api/admin/people+api.ts`, que agora chama daqui.
 */
export async function isAdminInDb(userId: string): Promise<boolean> {
  const db = getDb()
  const [row] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return row?.role === 'admin'
}

/**
 * Carrega o visitante: role fresca e entitlement.
 *
 * Duas queries, e nada mais. Chamar no topo do handler, uma vez — é o que substitui os
 * `EXISTS` por linha que o Zero disparava.
 */
export async function loadViewer(auth: AuthData): Promise<Viewer> {
  const db = getDb()

  const [isAdmin, subs] = await Promise.all([
    isAdminInDb(auth.id),
    db
      .select({ creatorId: subscription.creatorId, planId: subscription.planId })
      .from(subscription)
      .where(and(eq(subscription.userId, auth.id), inArray(subscription.status, ACTIVE))),
  ])

  return {
    id: auth.id,
    isAdmin,
    creators: new Set(subs.map((sub) => sub.creatorId)),
    plans: new Set(subs.map((sub) => `${sub.creatorId}:${sub.planId}`)),
  }
}

/**
 * Quem administra conteúdo: admin de verdade, ou o dono do feed.
 *
 * A segunda metade não é folga: o criador semeado pelas migrations nasce com
 * `role = 'user'`, e é pelo mesmo motivo que `canUploadMedia` (`mediaAccess.ts:44`) já
 * aceita `MASTER_USER_ID`. Também é o que preserva o comportamento do Zero, onde todo
 * gate começava com `feedOwnerId = userId` — o dono via o próprio rascunho sem ser admin.
 */
export const requireContentAdmin = (viewer: Viewer) =>
  viewer.isAdmin || (MASTER_USER_ID !== '' && viewer.id === MASTER_USER_ID)

/**
 * Visitante anônimo — nenhuma assinatura, nenhuma role.
 *
 * Existe para teste e para rota pública futura. Hoje toda rota exige sessão, igual ao
 * Zero, que recusava tudo quando `auth?.id` era vazio.
 */
export const anonymousViewer = (id = ''): Viewer => ({
  id,
  isAdmin: false,
  creators: new Set(),
  plans: new Set(),
})
