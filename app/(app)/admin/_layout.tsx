import { Redirect, Slot } from 'one'
import { isWeb } from 'tamagui'

import { canManage } from '~/features/admin/canManage'
import { useAuth } from '~/features/auth/client/authClient'
import { AdminShell } from '~/features/admin/AdminShell'

export function AdminLayout() {
  const { authData, state } = useAuth()

  // mesma forma do guard de `(app)/_layout.tsx`: enquanto carrega não decide nada,
  // senão expulsa quem tem sessão válida ainda não resolvida
  if (state === 'loading') {
    return null
  }

  if (!canManage(authData)) {
    return <Redirect href="/home/feed" />
  }

  // o admin é web-only por decisão do plano: não vale carregar essas telas no bundle
  // nativo. No nativo a rota existe mas manda de volta para o feed.
  if (!isWeb) {
    return <Redirect href="/home/feed" />
  }

  return (
    <AdminShell>
      <Slot />
    </AdminShell>
  )
}
