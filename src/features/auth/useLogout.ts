import { isWeb } from 'tamagui'

import { AUTH_URL } from '~/constants/urls'
import { clearAllAuth } from '~/features/auth/client/authClient'
import { dialogConfirm, showError } from '~/interface/dialogs/actions'
import { dropLocalZeroData } from '~/zero/client'

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
      /**
       * O sign-out feito à mão, e não por `authClient.signOut()`.
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
       * Com `fetch` puro dá para exigir `res.ok` e abortar antes de limpar o estado
       * local: melhor continuar logado do que achar que saiu e não ter saído.
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
    } catch (error) {
      console.error('logout error:', error)
      showError(error, 'Sair da conta')
      return false
    }

    // limpa localStorage, cookies não-HttpOnly e põe o estado em `logged-out`
    clearAllAuth()

    // Dado sincronizado que fica para trás. Não bloqueia a saída: se travar, a sessão
    // já morreu, que é o que importa.
    try {
      await dropLocalZeroData()
    } catch (error) {
      console.warn('[logout] não consegui apagar o banco local do Zero', error)
    }

    if (isWeb) {
      // navegação dura: derruba o cliente Zero e qualquer estado em memória de uma vez
      window.location.replace('/auth/login')
    }
    // No nativo não navegamos: quem redireciona é o `AppLayout` quando o estado vira
    // `logged-out`. Navegar aqui causava navegação dupla.

    return true
  }

  return { logout }
}
