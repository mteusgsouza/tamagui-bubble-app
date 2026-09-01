import './root.css'

import { Slot, Stack } from 'one'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { isWeb, YStack } from 'tamagui'

import { APP_NAME } from '~/constants/app'
import { PlatformSpecificRootProvider } from '~/interface/platform/PlatformSpecificRootProvider'
import { TamaguiRootProvider } from '~/tamagui/TamaguiRootProvider'

export function Layout() {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        {/* sem isto a aba do navegador mostra "localhost:8081" */}
        <title>{APP_NAME}</title>
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta property="og:image" content={`${process.env.ONE_SERVER_URL}/og.jpg`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:image" content={`${process.env.ONE_SERVER_URL}/og.jpg`} />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=5.0"
        />
        {/* O `.ico` não é redundante com o `.svg`: em modo SPA o shell inicial não tem
            este `<head>` (o React só o monta depois de hidratar), então o navegador
            pede `/favicon.ico` por padrão antes de qualquer JS rodar. Sem o arquivo,
            isso é um 404 em toda visita. */}
        <link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>

      <body>
        <div style={{ display: 'contents' }} data-testid="app-container">
          <PlatformSpecificRootProvider>
            <TamaguiRootProvider>
              <SafeAreaProvider>
                {isWeb ? (
                  <YStack flex={1}>
                    <Slot />
                  </YStack>
                ) : (
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(app)" />
                  </Stack>
                )}
              </SafeAreaProvider>
            </TamaguiRootProvider>
          </PlatformSpecificRootProvider>
        </div>
      </body>
    </html>
  )
}
