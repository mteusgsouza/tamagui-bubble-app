import { Stack } from 'one'

import { HeaderBackButton } from '~/interface/buttons/HeaderBackButton'

/** O `index` é aba raiz — sem botão de voltar. As telas de dentro mantêm o dele. */
export function SettingLayout() {
  return (
    <Stack
      screenOptions={{
        headerBlurEffect: 'regular',
        headerTransparent: true,
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerShadowVisible: true,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Perfil',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="edit-profile"
        options={{
          title: 'Editar perfil',
          headerLeft: () => <HeaderBackButton />,
        }}
      />
      <Stack.Screen
        name="blocked-users"
        options={{
          title: 'Bloqueados',
          headerLeft: () => <HeaderBackButton />,
        }}
      />
    </Stack>
  )
}
