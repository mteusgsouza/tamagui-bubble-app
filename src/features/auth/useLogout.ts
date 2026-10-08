import { isWeb } from 'tamagui'

import { AUTH_URL } from '~/constants/urls'
import { queryClient } from '~/data/client/queryClient'
import { authClient, clearAllAuth } from '~/features/auth/client/authClient'
import { dialogConfirm, showError } from '~/interface/dialogs/actions'

/**
 * Encerra a sessão **no servidor**. Lança se ele recusar: melhor continuar logado do que
 * achar que saiu e não ter saído.
 */
async function signOutOnServer() {
  if (!isWeb) {
    /**
     * No nativo a sessão não mora num cookie do sistema. O `expoClient` do Better Auth
     * (`platformClient.native.ts`) a guarda no MMKV e a injeta — junto com o cabeçalho
     * `expo-origin`, que o servidor troca por `origin` — **só nas chamadas feitas pelo
     * `authClient`**. O `fetch` cru da web chegaria sem sessão (400) ou, se o cookie jar
     * do Android pusesse um cookie, sem origem (403 `MISSING_OR_NULL_ORIGIN`).
     *
     * Pelo `$fetch` o plugin também apaga a sessão guardada no aparelho. Sem isso ela
     * seguiria no MMKV e voltaria a ser enviada na próxima abertura do app.
     */
    const { error } = await authClient.$fetch('/sign-out', { method: 'POST', body: {} })
    if (error) {
      throw new Error(`O servidor recusou o logout (HTTP ${error.status}).`)
    }
    return
  }

  /**
   * Na web, o sign-out feito à mão, e não por `authClient.signOut()`.
   *
   * Dois motivos, os dois medidos:
   *
   * 1. O Takeout embrulha `signOut` num Proxy
   *    (`@take-out/better-auth-utils/src/createAuthClient.ts`) que dispara o POST
   *    **sem aguardar** e chama `window.location.reload()` no mesmo tick. O reload
   *    cancela a requisição: o servidor nunca invalida a sessão nem manda o
   *    `Set-Cookie` de expiração. E o cookie é **HttpOnly** (medido: `document.cookie`
   *    volta vazio), então nada no cliente consegue apagá-lo — nem o
   *    `clearAuthCookies()` do próprio starter. Era um logout que não deslogava, e as
   *    sessões iam se acumulando no banco.
   * 2. O `$fetch` do better-auth **não lança** em erro: devolve `{ data, error }`.
   *    Trocar `signOut` por `$fetch` sem checar o retorno falha em silêncio — foi
   *    exatamente o que aconteceu na primeira tentativa desta correção.
   *
   * Com `fetch` puro dá para exigir `res.ok` e abortar antes de limpar o estado local.
   */
  const res = await fetch(`${AUTH_URL}/sign-out`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    credentials: 'include',
  })

  if (!res.ok) {
    throw new Error(`O servidor recusou o logout (HTTP ${res.status}).`)
  }
}

export const useLogout = () => {
  const logout = async (options?: { skipConfirm?: boolean }) => {
    if (!options?.skipConfirm) {
      const confirmed = await dialogConfirm({
        title: 'Sair da conta',
        description: 'Tem certeza que quer sair?',
      })

      if (!confirmed) return false
    }

    try {
      await signOutOnServer()
    } catch (error) {
      console.error('logout error:', error)
      showError(error, 'Sair da conta')
      return false
    }

    // limpa localStorage, cookies não-HttpOnly e põe o estado em `logged-out`
    clearAllAuth()

    // O conteúdo da conta anterior sai da memória. Antes era `dropLocalZeroData()`, que
    // apagava bancos no IndexedDB e podia travar; agora o cache é só memória e
    // `clear()` não falha — foi por isso que não persistir o cache é a escolha certa
    // para conteúdo pago.
    queryClient.clear()

    if (isWeb) {
      // navegação dura: derruba qualquer estado em memória de uma vez
      window.location.replace('/auth/login')
    }
    // No nativo não navegamos: quem redireciona é o `AppLayout` quando o estado vira
    // `logged-out`. Navegar aqui causava navegação dupla.

    return true
  }

  return { logout }
}
