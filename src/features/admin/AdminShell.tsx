import { Link, usePathname } from 'one'
import { ScrollView, SizableText, XStack, YStack } from 'tamagui'

import { canManagePeople } from '~/features/admin/canManage'
import { useAuth } from '~/features/auth/client/authClient'
import { HeaderBackButton } from '~/interface/buttons/HeaderBackButton'
import { Pressable } from '~/interface/buttons/Pressable'

import type { ReactNode } from 'react'
import type { Href } from 'one'

type NavItem = { href: Href; label: string; adminOnly?: boolean }

const NAV: NavItem[] = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/posts', label: 'Posts' },
  { href: '/admin/courses', label: 'Cursos' },
  { href: '/admin/plans', label: 'Planos', adminOnly: true },
  { href: '/admin/people', label: 'Pessoas', adminOnly: true },
]

/**
 * Moldura do admin: cabeçalho, navegação e largura de leitura.
 *
 * "Pessoas" e "Planos" só aparecem para `role = 'admin'` de verdade — o criador
 * administra o conteúdo dele, não a base de usuários nem os preços (ver `canManage.ts`).
 * Não é só estética: a escrita em `plan` é fechada por `serverWhere(() => false)` e só o
 * admin passa, então mostrar a tela ao criador daria um formulário que reverte sozinho.
 */
export const AdminShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname()
  const { authData } = useAuth()
  const showPeople = canManagePeople(authData)

  const items = NAV.filter((item) => !item.adminOnly || showPeople)

  return (
    <YStack bg="$background" flex={1} {...({ minHeight: '100vh' } as any)}>
      {/* `px` menor no celular: em 360px, `$4` nas duas beiradas come 10% da largura
          útil, e é aí que a grade de fotos do composer fica apertada */}
      <YStack width="100%" maxW={980} mx="auto" px="$3" pb="$8" $md={{ px: '$4' }}>
        <XStack items="center" gap="$3" py="$4">
          {/*
            Volta no histórico, como todo caret do app. Antes era um `Link` fixo para
            `/home/feed`: de `/admin/posts/<id>` ele pulava o `/admin/posts` inteiro e
            jogava quem estava editando lá fora. O `fallbackHref` cobre quem abriu a URL
            direto e não tem para onde voltar.
          */}
          <HeaderBackButton fallbackHref="/home/feed" ml="$-2" />
          <SizableText size="$6" fontWeight="700" $md={{ size: '$7' }}>
            Admin
          </SizableText>
        </XStack>

        {/*
          Faixa que rola, não pílulas que quebram linha: em 360px as cinco abas viravam
          três linhas e empurravam o conteúdo da tela para baixo da dobra. No desktop
          elas cabem, então não há o que rolar e nada muda.
        */}
        {/* o `YStack` carrega a margem: o `ScrollView` do Tamagui não aceita props de
            caixa como `mb`/`flexGrow` — elas são omitidas do tipo dele */}
        <YStack mb="$4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <XStack gap="$2" flexWrap="nowrap">
              {items.map((item) => {
                // `/admin` casaria com tudo; exige igualdade para a raiz
                const active =
                  item.href === '/admin'
                    ? pathname === '/admin' || pathname === '/admin/'
                    : pathname.startsWith(item.href as string)

                return (
                  <Link key={item.href as string} href={item.href}>
                    <Pressable
                      px="$3"
                      py="$2"
                      rounded="$12"
                      borderWidth={1}
                      borderColor={active ? '$accent7' : '$borderColor'}
                      bg={active ? '$accent3' : 'transparent'}
                      hoverStyle={{ bg: active ? '$accent3' : '$color2' }}
                      role="button"
                    >
                      <SizableText
                        size="$2"
                        fontWeight="600"
                        color={active ? '$accent11' : '$color10'}
                        whiteSpace="nowrap"
                      >
                        {item.label}
                      </SizableText>
                    </Pressable>
                  </Link>
                )
              })}
            </XStack>
          </ScrollView>
        </YStack>

        {children}
      </YStack>
    </YStack>
  )
}

/** Cabeçalho de seção, com ação opcional à direita. */
export const AdminSection = ({
  title,
  detail,
  action,
  children,
}: {
  title: string
  detail?: string
  action?: ReactNode
  children: ReactNode
}) => (
  <YStack gap="$3" pb="$6">
    <XStack items="flex-end" justify="space-between" gap="$3" flexWrap="wrap">
      <YStack gap="$0.5">
        <SizableText size="$6" fontWeight="700">
          {title}
        </SizableText>
        {detail ? (
          <SizableText size="$2" color="$color10">
            {detail}
          </SizableText>
        ) : null}
      </YStack>
      {action}
    </XStack>
    {children}
  </YStack>
)

/**
 * Altura da barra de ação do celular. Mora aqui pelo mesmo motivo que
 * `BOTTOM_BAR_HEIGHT` mora em `constants/navigation`: a barra é `fixed`, **sai do
 * fluxo**, e quem desenha debaixo dela precisa compensar na mão.
 */
export const ADMIN_ACTION_BAR_HEIGHT = 64

/**
 * As ações da tela, grudadas embaixo — no celular.
 *
 * Por que existe: "Salvar" e "Publicar" vivem no cabeçalho do `AdminSection`, que no
 * desktop está sempre à vista. Numa tela de celular, escrever o texto do post empurra o
 * cabeçalho para fora da rolagem, e o criador acaba procurando o botão de salvar. A
 * barra resolve isso sem mexer no desktop, onde ela não aparece.
 *
 * Desenha o espaçador junto, de propósito: separar os dois faria com que a próxima tela
 * a usar a barra esquecesse o `padding` e deixasse o último campo embaixo dela.
 */
export const AdminActionBar = ({ children }: { children: ReactNode }) => (
  <>
    <YStack height={ADMIN_ACTION_BAR_HEIGHT} />
    <XStack
      b={0}
      l={0}
      r={0}
      z={50}
      items="center"
      justify="flex-end"
      gap="$2"
      px="$4"
      py="$2.5"
      bg="$background"
      borderTopWidth={1}
      borderColor="$borderColor"
      $platform-web={{
        position: 'fixed',
        // faixa do gesto no iPhone; sem isto o botão fica debaixo dela
        paddingBottom: 'env(safe-area-inset-bottom)' as any,
      }}
    >
      {children}
    </XStack>
  </>
)

export const AdminEmpty = ({ children }: { children: string }) => (
  <YStack
    py="$8"
    items="center"
    rounded="$6"
    borderWidth={1}
    borderColor="$borderColor"
    borderStyle="dashed"
  >
    <SizableText size="$3" color="$color10">
      {children}
    </SizableText>
  </YStack>
)
