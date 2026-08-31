import { HouseIcon } from '~/interface/icons/phosphor/HouseIcon'
import { PlayCircleIcon } from '~/interface/icons/phosphor/PlayCircleIcon'
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
 * Qual aba está ativa para um caminho.
 *
 * Compara por prefixo para que as telas de dentro (`/home/feed/<id>`,
 * `/home/settings/edit-profile`) mantenham a aba acesa. Sem correspondência devolve
 * `null` em vez de chutar a primeira — assim uma rota fora das abas não acende nada.
 */
export const activeTab = (pathname: string): string | null =>
  APP_TABS.find((tab) => pathname.startsWith(tab.href as string))?.name ?? null
