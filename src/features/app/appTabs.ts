import { HouseIcon } from '~/interface/icons/phosphor/HouseIcon'
import { PlayCircleIcon } from '~/interface/icons/phosphor/PlayCircleIcon'
import { SquaresFourIcon } from '~/interface/icons/phosphor/SquaresFourIcon'
import { UserCircleIcon } from '~/interface/icons/phosphor/UserCircleIcon'

import type { IconComponent } from '~/interface/icons/types'
import type { Href } from 'one'

export type AppTab = {
  /** casa com o nome da pasta da rota — é o que o `Tabs.Screen` do nativo registra */
  name: string
  href: Href
  label: string
  icon: IconComponent
}

/**
 * As abas do app, num lugar só.
 *
 * **A web e o nativo leem daqui.** A web desenha a barra à mão (`AppNav.tsx`) porque
 * navegador do react-navigation na web reseta a rota no carregamento direto — ver o bug
 * de deep link no STATE. O nativo usa o `Tabs` do One. Sem esta lista compartilhada, as
 * duas barras divergiriam na primeira aba nova.
 */
export const APP_TABS: AppTab[] = [
  { name: 'feed', href: '/home/feed', label: 'Feed', icon: HouseIcon },
  { name: 'courses', href: '/home/courses', label: 'Cursos', icon: PlayCircleIcon },
  { name: 'settings', href: '/home/settings', label: 'Perfil', icon: UserCircleIcon },
]

/**
 * O admin — item da sidebar do desktop, e só dali.
 *
 * ⚠️ **Fora do `APP_TABS` de propósito.** Aquela lista alimenta o `Tabs` do nativo
 * (`_layout.native.tsx`), e o admin é web-only: `app/(app)/admin/_layout.tsx` devolve ao
 * feed quando `!isWeb`. Registrar uma `Tabs.Screen` que só redireciona seria pior que
 * não ter — e a rota nem mora dentro do grupo `(tabs)`, então lá não resolveria.
 *
 * A **barra inferior do celular não recebe este item**, por decisão de produto: as telas
 * de admin são de mesa, e no celular o caminho continua sendo Perfil → Administração.
 * É a única divergência deliberada entre as duas barras da web.
 *
 * Quem decide se ele aparece é o `canManage`, na `AppSidebar`.
 */
export const ADMIN_TAB: AppTab = {
  name: 'admin',
  href: '/admin',
  label: 'Admin',
  icon: SquaresFourIcon,
}

/**
 * Qual aba está ativa para um caminho.
 *
 * Compara por prefixo para que as telas de dentro (`/home/feed/<id>`,
 * `/home/settings/edit-profile`) mantenham a aba acesa. Sem correspondência devolve
 * `null` em vez de chutar a primeira — assim uma rota fora das abas não acende nada.
 */
export const activeTab = (pathname: string): string | null =>
  APP_TABS.find((tab) => pathname.startsWith(tab.href as string))?.name ?? null
