import { Slot } from 'one'

import { AppShell } from '~/features/app/AppNav'

export function TabsLayout() {
  return (
    <AppShell>
      <Slot />
    </AppShell>
  )
}
