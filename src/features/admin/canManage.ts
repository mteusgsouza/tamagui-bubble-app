// Quem entra no /admin.
//
// Mesma regra do `canUploadMedia` da Fase 5, e pelo mesmo motivo: o criador semeado
// pelas migrations tem `role = 'user'` e o `ADMIN_WHITELIST` vem com e-mails de exemplo.
// Exigir só `admin` trancaria o dono do produto para fora da própria área.
//
// ⚠️ Isto é guard de **navegação**, não de dados. Quem protege os dados é a permission
// do Zero no servidor (conteúdo) e a checagem dentro de cada rota de `app/api/admin/`
// (pessoas). Um usuário comum que force a URL vê telas vazias, não dados de terceiros.

import { MASTER_USER_ID } from '~/constants/creator'

import type { AuthData } from '~/features/auth/types'

export const canManage = (auth: AuthData | null | undefined) =>
  Boolean(
    auth && (auth.role === 'admin' || (MASTER_USER_ID && auth.id === MASTER_USER_ID)),
  )

/**
 * Só quem é `role = 'admin'` de verdade mexe em pessoas (usuários, assinaturas,
 * pagamentos). O criador administra o **conteúdo** dele, não a base de usuários.
 *
 * ⚠️ O JWT do Takeout dura 3 anos, então promover alguém a admin **não tem efeito até o
 * token renovar** — a claim fica congelada. Por isso as rotas de `app/api/admin/`
 * relêem a role do Postgres em vez de confiar no `authData`.
 */
export const canManagePeople = (auth: AuthData | null | undefined) =>
  Boolean(auth && auth.role === 'admin')
