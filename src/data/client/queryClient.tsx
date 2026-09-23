// O cache de dados do cliente. Substitui o replica local do Zero.
//
// O que fazia o app parecer rápido com o Zero era ler de um replica local e nunca
// piscar. Aqui isso vira stale-while-revalidate — mas **só funciona se ninguém
// renderizar spinner quando já existe dado em cache**. As regras estão em
// `src/data/client/hooks.ts`; este arquivo só monta o cliente.

import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { AppState } from 'react-native'
import { isWeb } from 'tamagui'

import { ApiError } from '~/helpers/apiFetch'

import type { ReactNode } from 'react'

/**
 * Singleton de módulo, criado uma vez.
 *
 * 🔴 **Nunca recriar por usuário nem passar `key={userId}` no provider.** Remontar a
 * subárvore quando a sessão resolve é literalmente o bug que custou horas nesta base:
 * o roteador reinicializa na primeira rota do grupo em ordem alfabética e `/home/feed`
 * vira `/admin` (invariante 10). A separação por usuário vai na **query key**, não na
 * árvore — ver `keys.ts`.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // janela em que o dado em cache é servido sem ir à rede
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,

      // 🔴 não repetir 4xx. Sem isto um 403 de paywall vira 3 requisições e ~2 s de
      // espera antes de a tela conseguir mostrar o card bloqueado.
      retry: (count, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
          return false
        }
        return count < 2
      },

      // ℹ️ Não há `notifyOnChangeProps: 'tracked'` aqui: na v5 isso virou o padrão, e
      // passar a string explicitamente não compila. Revalidação já não re-renderiza
      // quem não lê o campo que mudou.
    },
    mutations: {
      retry: false,
    },
  },
})

/**
 * ⚠️ **`refetchOnWindowFocus` é inerte no nativo** sem ligar o `focusManager` ao
 * `AppState`: no React Native não existe evento de foco de janela. Sem isto, voltar o
 * app do background não revalidaria nada, e o refetch por foco é justamente o que
 * substitui a atualização ao vivo do Zero.
 *
 * `onlineManager` fica no default (assume online). Ligá-lo exigiria
 * `@react-native-community/netinfo`, que não está nas deps; o efeito é só que
 * `refetchOnReconnect` não dispara no nativo, e o foco cobre o caso real.
 */
if (!isWeb) {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status) => {
      handleFocus(status === 'active')
    })
    return () => subscription.remove()
  })
}

/**
 * Entra **exatamente** onde o `<ProvideZero>` está, entre `<Configuration disableSSR>` e
 * `<ToastProvider>`.
 *
 * Sempre renderiza `children` — nunca `null`, nunca condicional por estado de auth.
 */
export const ProvideQueryClient = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)
