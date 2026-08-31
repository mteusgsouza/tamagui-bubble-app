import { Link, usePathname } from 'one'
import { SizableText, XStack, YStack } from 'tamagui'

import { Logo } from '~/interface/app/Logo'
import { Pressable } from '~/interface/buttons/Pressable'

import { activeTab, APP_TABS } from './appTabs'

import type { ReactNode } from 'react'

/**
 * Navegação do app na web: barra embaixo no mobile, coluna à esquerda no desktop.
 *
 * ⚠️ **Tudo aqui é `Link` + `position: fixed`, nunca navegador do react-navigation.**
 * Na web o `Stack`/`Tabs` do react-navigation assume o roteamento e reseta a rota no
 * carregamento direto de URL — é o bug de deep link documentado no STATE. Barra
 * desenhada à mão não tem esse problema.
 *
 * ⚠️ **`$md` aqui é `minWidth: 768`** (config v5 do Tamagui, mobile-first). Então o
 * estilo base é o do celular e o `$md` é o do desktop — o contrário da v4.
 */

const TOP_BAR_HEIGHT = 56
const BOTTOM_BAR_HEIGHT = 68
const SIDEBAR_WIDTH = 240

/** Cor do item ativo. */
const ACTIVE = '$accent11'
const INACTIVE = '$color10'

/** Topo do mobile: só a logo, centralizada. */
export const AppTopBar = () => (
  <XStack
    t={0}
    l={0}
    r={0}
    z={50}
    height={TOP_BAR_HEIGHT}
    items="center"
    justify="center"
    bg="$background"
    borderBottomWidth={1}
    borderColor="$borderColor"
    $platform-web={{ position: 'fixed' }}
    $md={{ display: 'none' }}
  >
    <Link href="/home/feed" aria-label="Início">
      <Logo height={22} />
    </Link>
  </XStack>
)

/** Barra inferior do mobile. */
export const AppBottomBar = () => {
  const pathname = usePathname()
  const current = activeTab(pathname)

  return (
    <XStack
      b={0}
      l={0}
      r={0}
      z={50}
      items="stretch"
      bg="$background"
      borderTopWidth={1}
      borderColor="$borderColor"
      $platform-web={{
        position: 'fixed',
        // respeita a faixa do gesto no iPhone; sem isto o último item fica embaixo dela
        paddingBottom: 'env(safe-area-inset-bottom)' as any,
      }}
      $md={{ display: 'none' }}
    >
      {APP_TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = current === tab.name
        return (
          <Link key={tab.name} href={tab.href} style={{ flexGrow: 1 }}>
            <Pressable
              height={BOTTOM_BAR_HEIGHT}
              gap="$1.5"
              items="center"
              justify="center"
              hoverStyle={{ bg: '$color2' }}
              pressStyle={{ bg: '$color3' }}
              role="link"
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={23} color={isActive ? ACTIVE : INACTIVE} />
              <SizableText
                size="$1"
                fontWeight={isActive ? '600' : '400'}
                color={isActive ? ACTIVE : INACTIVE}
              >
                {tab.label}
              </SizableText>
            </Pressable>
          </Link>
        )
      })}
    </XStack>
  )
}

/** Coluna do desktop: logo em cima, abas embaixo. */
export const AppSidebar = () => {
  const pathname = usePathname()
  const current = activeTab(pathname)

  return (
    <YStack
      t={0}
      b={0}
      l={0}
      z={50}
      width={SIDEBAR_WIDTH}
      gap="$2"
      px="$3"
      py="$4"
      bg="$background"
      borderRightWidth={1}
      borderColor="$borderColor"
      display="none"
      $platform-web={{ position: 'fixed' }}
      $md={{ display: 'flex' }}
    >
      <Link href="/home/feed" aria-label="Início">
        <XStack px="$3" py="$2" mb="$2">
          <Logo height={26} />
        </XStack>
      </Link>

      {APP_TABS.map((tab) => {
        const Icon = tab.icon
        const isActive = current === tab.name
        return (
          <Link key={tab.name} href={tab.href}>
            <Pressable
              flexDirection="row"
              items="center"
              gap="$3"
              px="$3"
              py="$2.5"
              rounded="$10"
              bg={isActive ? '$color3' : 'transparent'}
              hoverStyle={{ bg: isActive ? '$color3' : '$color2' }}
              role="link"
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={24} color={isActive ? ACTIVE : INACTIVE} />
              <SizableText
                size="$5"
                fontWeight={isActive ? '700' : '400'}
                color={isActive ? ACTIVE : INACTIVE}
              >
                {tab.label}
              </SizableText>
            </Pressable>
          </Link>
        )
      })}
    </YStack>
  )
}

/**
 * A moldura: as três peças mais o espaço que elas ocupam.
 *
 * As barras são `fixed`, então **o conteúdo precisa do respiro correspondente** — sem
 * isso o topo do feed nasce embaixo da barra e o último post fica atrás dela.
 */
export const AppShell = ({ children }: { children: ReactNode }) => (
  <>
    <AppTopBar />
    <AppSidebar />
    {/*
      ⚠️ `minHeight` não é decoração. Só com `flex={1}` esta caixa fica com **altura 0**
      (o pai não tem altura definida), e aí qualquer filho `flex: 1` — o `ScrollView` do
      Perfil, por exemplo — resolve para 0 e **recorta o conteúdo**. O feed disfarçava
      porque transborda visível; a tela de Perfil ficava em branco.
    */}
    <YStack
      flex={1}
      pt={TOP_BAR_HEIGHT}
      pb={BOTTOM_BAR_HEIGHT}
      $platform-web={{ minHeight: '100dvh' }}
      $md={{ pt: 0, pb: 0, pl: SIDEBAR_WIDTH }}
    >
      {children}
    </YStack>
    <AppBottomBar />
  </>
)
