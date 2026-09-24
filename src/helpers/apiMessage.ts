// Erro cru → frase de tela.
//
// Nasceu em `src/features/billing/client/billingApi.ts` como `billingMessage` e subiu
// para cá quando o resto do app passou a falar REST. Mesmo movimento que
// `src/features/media/mediaApi.ts` fez com `apiFetch`; `billingApi` reexporta o nome
// antigo para não quebrar os chamadores.

import { ApiError } from './apiFetch'

/**
 * Traduz o erro para o usuário **sem perder o código**.
 *
 * O `code` é o contrato com o servidor; o `error` é o fallback quando a tela não conhece
 * aquele código. Falha de rede tem texto próprio porque é o único caso em que a ação do
 * usuário é "tentar de novo", não "corrigir alguma coisa".
 */
export function apiMessage(error: unknown, messages: Record<string, string>): string {
  if (error instanceof ApiError) {
    return messages[error.code] || error.message || 'Não deu para continuar.'
  }
  return 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
}
