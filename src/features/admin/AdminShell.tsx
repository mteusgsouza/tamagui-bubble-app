import { Link, usePathname } from 'one'
import { SizableText, XStack, YStack } from 'tamagui'

import { canManagePeople } from '~/features/admin/canManage'
import { useAuth } from '~/features/auth/client/authClient'
import { Pressable } from '~/interface/buttons/Pressable'
import { CaretLeftIcon } from '~/interface/icons/phosphor/CaretLeftIcon'

import type { ReactNode } from 'react'
import type { Href } from 'one'

type NavItem = { href: Href; label: string; peopleOnly?: boolean }

const NAV: NavItem[] = [
  { href: '/admin', label: 'Visão geral' },
  { href: '/admin/posts', label: 'Posts' },
  { href: '/admin/courses', label: 'Cursos' },
  { href: '/admin/people', label: 'Pessoas', peopleOnly: true },
]

/**
 * Moldura do admin: cabeçalho, navegação e largura de leitura.
 *
 * "Pessoas" só aparece para `role = 'admin'` de verdade — o criador administra o
 * conteúdo dele, não a base de usuários (ver `canManage.ts`).
 */
export const AdminShell = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname()
  const { authData } = useAuth()
  const showPeople = canManagePeople(authData)

  const items = NAV.filter((item) => !item.peopleOnly || showPeople)

  return (
    <YStack bg="$background" flex={1} {...({ minHeight: '100vh' } as any)}>
      <YStack width="100%" maxW={980} mx="auto" px="$4" pb="$8">
        <XStack items="center" gap="$3" py="$4">
          <Link href="/home/feed" aria-label="Voltar ao app">
            <Pressable role="button">
              <CaretLeftIcon size={22} />
            </Pressable>
          </Link>
          <SizableText size="$7" fontWeight="700">
            Admin
          </SizableText>
        </XStack>

        <XStack gap="$2" pb="$4" flexWrap="wrap">
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
                  py="$1.5"
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
                  >
                    {item.label}
                  </SizableText>
                </Pressable>
              </Link>
            )
          })}
        </XStack>

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
