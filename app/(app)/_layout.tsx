import { Redirect, Slot, Stack, usePathname } from 'one'
import { Configuration, isWeb } from 'tamagui'

import { useAuth } from '~/features/auth/client/authClient'
import { DialogProvider } from '~/interface/dialogs/Dialog'
import { PlatformSpecificRootProvider } from '~/interface/platform/PlatformSpecificRootProvider'
import { ToastProvider } from '~/interface/toast/Toast'
import { ProvideZero } from '~/zero/client'

export function AppLayout() {
  const { state } = useAuth()
  const pathname = usePathname()

  if (state === 'loading') {
    return null
  }

  // redirect logged-out users away from protected routes
  const isLoggedInRoute = pathname.startsWith('/home')
  if (state === 'logged-out' && isLoggedInRoute) {
    return <Redirect href="/auth/login" />
  }

  // redirect logged-in users away from auth routes
  const isAuthRoute = pathname.startsWith('/auth')
  if (state === 'logged-in' && isAuthRoute) {
    return <Redirect href="/home/feed" />
  }

  return (
    <Configuration disableSSR>
      <ProvideZero>
        <ToastProvider>
          <DialogProvider>
            <PlatformSpecificRootProvider>
              {/* `isWeb`, e não `process.env.VITE_PLATFORM`: essa env var nunca é definida —
                  nem pelo projeto, nem pelo One/vxrn — então a comparação dava `false` na
                  web e este layout caía no ramo nativo. O Stack do react-navigation
                  assumia o roteamento e resetava para a tela inicial a cada carregamento
                  direto de URL: todo deep link terminava em /home/feed. */}
              {isWeb ? (
                <Slot />
              ) : (
                // We need Stack here for transition animation to work on native
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="home" />
                  <Stack.Screen name="auth" />
                </Stack>
              )}
            </PlatformSpecificRootProvider>
          </DialogProvider>
        </ToastProvider>
      </ProvideZero>
    </Configuration>
  )
}
