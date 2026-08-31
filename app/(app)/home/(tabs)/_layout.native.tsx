import { Tabs } from 'one'

import { APP_TABS } from '~/features/app/appTabs'
import { BRAND_ACCENT } from '~/tamagui/brandAccent'

/**
 * Barra de abas nativa.
 *
 * As abas saem de `appTabs.ts`, a mesma lista que a barra da web usa — é o que impede as
 * duas de divergirem. Aqui o `Tabs` do One (react-navigation) é seguro; na web ele não é
 * (ver o comentário em `AppNav.tsx`).
 */
export function TabsLayout() {
  return (
    <Tabs
      initialRouteName="feed"
      screenOptions={{
        headerShown: false,
        // o react-navigation não lê token do Tamagui; vem da mesma constante da rampa
        tabBarActiveTintColor: BRAND_ACCENT,
      }}
    >
      {APP_TABS.map((tab) => {
        const Icon = tab.icon
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.label,
              tabBarIcon: ({ color }: { color: string }) => (
                <Icon size={23} color={color as any} />
              ),
            }}
          />
        )
      })}
    </Tabs>
  )
}
