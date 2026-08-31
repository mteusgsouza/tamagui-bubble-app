import { Slot, Stack } from 'one'
import { isWeb, YStack } from 'tamagui'

export function AuthAndOnboardingLayout() {
  return (
    <>
      {/* `isWeb`, não `process.env.VITE_PLATFORM` — essa env var nunca é definida, então
          na web isto caía no ramo nativo e o Stack quebrava todo deep link. */}
      {isWeb ? (
        // Na web as três etapas ficam numa coluna centrada na altura da janela. Sem isto
        // elas nascem coladas no topo esquerdo, que é como o passo de e-mail estava.
        <YStack flex={1} justify="center" $platform-web={{ minHeight: '100dvh' }}>
          <Slot />
        </YStack>
      ) : (
        <Stack screenOptions={{ headerShown: false }} initialRouteName="login">
          <Stack.Screen name="login" />
          <Stack.Screen name="login/password" />
          <Stack.Screen name="signup/[method]" />
        </Stack>
      )}
    </>
  )
}
