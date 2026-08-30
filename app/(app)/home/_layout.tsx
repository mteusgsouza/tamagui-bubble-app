import { Slot, Stack } from 'one'
import { isWeb } from 'tamagui'

export function AppLayout() {
  return (
    <>
      {/* `isWeb`, não `process.env.VITE_PLATFORM` — essa env var nunca é definida, então
          na web isto caía no ramo nativo e o Stack quebrava todo deep link. */}
      {isWeb ? (
        <Slot />
      ) : (
        // We need Stack here for transition animation to work on native
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
        </Stack>
      )}
    </>
  )
}
