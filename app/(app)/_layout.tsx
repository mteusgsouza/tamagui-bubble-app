import { Redirect, Slot, Stack, usePathname } from 'one'
import { Configuration, isWeb } from 'tamagui'

import { useAuth } from '~/features/auth/client/authClient'
import { DialogProvider } from '~/interface/dialogs/Dialog'
import { PlatformSpecificRootProvider } from '~/interface/platform/PlatformSpecificRootProvider'
import { ProvideQueryClient } from '~/data/client/queryClient'
import { ToastProvider } from '~/interface/toast/Toast'

/**
 * Guard do app.
 *
 * ⚠️ **Nunca devolva `null` daqui.** A versão anterior fazia
 * `if (state === 'loading') return null`, e isso desmontava a árvore inteira —
 * providers e roteador junto. Quando a sessão resolvia (~200ms depois do boot), tudo
 * remontava e o roteador se reinicializava na **primeira rota do grupo em ordem
 * alfabética**, que hoje é `/admin`. Medido: `/home/feed` → `/admin` aos 1237ms →
 * de volta aos 1530ms. Aparecia no login, no logout e em qualquer carregamento direto.
 *
 * Agora os providers ficam montados o tempo todo e só o conteúdo é trocado.
 */
export function AppLayout() {
  const { state } = useAuth()
  const pathname = usePathname()

  const loading = state === 'loading'

  /**
   * As rotas que exigem sessão.
   *
   * ⚠️ **Rota nova fora de `/home` não entra aqui sozinha.** `/assinar` mora na raiz do
   * grupo e precisou ser listada: sem isso, deslogado abre a tela e fica girando para
   * sempre, porque as queries do Zero nascem `enabled: false` sem `userId` — tela
   * quebrada sem erro, que é o pior modo de falhar.
   */
  const needsSession =
    pathname.startsWith('/home') || pathname.startsWith('/assinar')

  // Redireciona só depois que a sessão resolveu: decidir durante o `loading` chuta o
  // usuário logado para o login e vice-versa.
  const redirectTo = loading
    ? null
    : state === 'logged-out' && needsSession
      ? '/auth/login'
      : state === 'logged-in' && pathname.startsWith('/auth')
        ? '/home/feed'
        : null

  return (
    <Configuration disableSSR>
      <ProvideQueryClient>
          <ToastProvider>
            <DialogProvider>
              <PlatformSpecificRootProvider>
                {redirectTo ? (
                  <Redirect href={redirectTo as any} />
                ) : isWeb ? (
                  /* `isWeb`, e não `process.env.VITE_PLATFORM`: essa env var nunca é
                     definida — nem pelo projeto, nem pelo One/vxrn — então a comparação
                     dava `false` na web e este layout caía no ramo nativo. */
                  <Slot />
                ) : (
                  // We need Stack here for transition animation to work on native
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="home" />
                    <Stack.Screen name="auth" />
                    {/* irmã de `home`, não filha: é caminho de conversão e não tem abas */}
                    <Stack.Screen name="assinar" />
                  </Stack>
                )}
              </PlatformSpecificRootProvider>
            </DialogProvider>
          </ToastProvider>
      </ProvideQueryClient>
    </Configuration>
  )
}
