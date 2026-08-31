import { Link } from 'one'
import { memo } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { adminCourses, adminPosts } from '~/data/queries/admin'
import { AdminSection } from '~/features/admin/AdminShell'
import { useAuth } from '~/features/auth/client/authClient'
import { useQuery } from '~/zero/client'

import type { Href } from 'one'

export const AdminHomePage = memo(() => {
  const { user } = useAuth()
  const userId = user?.id || ''
  const enabled = Boolean(userId && MASTER_USER_ID)

  const [posts] = useQuery(
    adminPosts,
    { feedOwnerId: MASTER_USER_ID, userId, limit: 200 },
    { enabled },
  )
  const [courses] = useQuery(
    adminCourses,
    { feedOwnerId: MASTER_USER_ID, userId },
    { enabled },
  )

  const allPosts = posts ?? []
  const allCourses = courses ?? []

  const published = allPosts.filter((p: any) => p.published && !p.deleted).length
  const drafts = allPosts.filter((p: any) => !p.published && !p.deleted).length
  const publishedCourses = allCourses.filter((c: any) => c.published).length
  const lessons = allCourses.reduce(
    (sum: number, c: any) => sum + (c.lessons?.length ?? 0),
    0,
  )

  return (
    <YStack gap="$4">
      <AdminSection title="Visão geral" detail="O que existe hoje no seu conteúdo.">
        <XStack gap="$3" flexWrap="wrap">
          <Stat label="Posts publicados" value={published} href="/admin/posts" />
          <Stat label="Rascunhos" value={drafts} href="/admin/posts" />
          <Stat
            label="Cursos publicados"
            value={publishedCourses}
            href="/admin/courses"
          />
          <Stat label="Aulas" value={lessons} href="/admin/courses" />
        </XStack>
      </AdminSection>

      {!MASTER_USER_ID ? (
        <SizableText size="$3" color="$red10">
          VITE_MASTER_USER_ID está vazio: sem ele o admin não sabe de quem é o conteúdo.
        </SizableText>
      ) : null}
    </YStack>
  )
})

const Stat = ({ label, value, href }: { label: string; value: number; href: Href }) => (
  <Link href={href} style={{ flexGrow: 1, flexBasis: 200 }}>
    <YStack
      gap="$1"
      p="$4"
      rounded="$6"
      borderWidth={1}
      borderColor="$borderColor"
      bg="$color1"
      hoverStyle={{ borderColor: '$accent7' }}
    >
      <SizableText size="$9" fontWeight="700" color="$accent11">
        {value}
      </SizableText>
      <SizableText size="$2" color="$color10">
        {label}
      </SizableText>
    </YStack>
  </Link>
)
