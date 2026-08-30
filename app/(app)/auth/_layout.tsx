import { Slot, Stack } from 'one'
import { isWeb } from 'tamagui'

export function AuthAndOnboardingLayout() {
  return (
    <>
      {/* `isWeb`, não `process.env.VITE_PLATFORM` — essa env var nunca é definida, então
          na web isto caía no ramo nativo e o Stack quebrava todo deep link. */}
      {isWeb ? (
        <Slot />
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
