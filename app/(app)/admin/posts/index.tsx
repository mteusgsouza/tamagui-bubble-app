import { Link, useRouter } from 'one'
import { memo } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { adminPosts } from '~/data/queries/admin'
import { AdminEmpty, AdminSection } from '~/features/admin/AdminShell'
import { useAuth } from '~/features/auth/client/authClient'
import { timeAgo } from '~/features/feed/formatDate'
import { newId } from '~/helpers/id'
import { Button } from '~/interface/buttons/Button'
import { useQuery } from '~/zero/client'

export const AdminPostsPage = memo(() => {
  const router = useRouter()
  const { user } = useAuth()
  const userId = user?.id || ''

  const [posts] = useQuery(
    adminPosts,
    { feedOwnerId: MASTER_USER_ID, userId, limit: 200 },
    { enabled: Boolean(userId && MASTER_USER_ID) },
  )

  const rows = (posts ?? []) as any[]

  // o id nasce aqui e vai na URL: o composer cria a linha só quando você salva, então
  // abrir "novo post" e desistir não deixa rascunho órfão no banco
  const startNew = () => router.push(`/admin/posts/${newId()}?novo=1`)

  return (
    <AdminSection
      title="Posts"
      detail={`${rows.length} no total, incluindo rascunhos e apagados`}
      action={
        <Button
          size="$3"
          bg="$accentBackground"
          onPress={startNew}
          data-testid="new-post"
        >
          <SizableText size="$3" fontWeight="600" color="$accentColor">
            Novo post
          </SizableText>
        </Button>
      }
    >
      {rows.length === 0 ? (
        <AdminEmpty>Nenhum post ainda. Comece pelo botão acima.</AdminEmpty>
      ) : (
        <YStack rounded="$6" borderWidth={1} borderColor="$borderColor" overflow="hidden">
          {rows.map((post, index) => (
            <Link
              key={post.id}
              href={`/admin/posts/${post.id}`}
              style={{ width: '100%' }}
            >
              <XStack
                gap="$3"
                p="$3"
                items="center"
                borderTopWidth={index === 0 ? 0 : 1}
                borderColor="$borderColor"
                hoverStyle={{ bg: '$color2' }}
              >
                <YStack flex={1} gap="$1">
                  <SizableText size="$4" fontWeight="600" color="$color12">
                    {post.title || '(sem título)'}
                  </SizableText>
                  <SizableText size="$1" color="$color10">
                    {post.kind} · {post.visibility === 'public' ? 'aberto' : 'assinantes'}
                    {post.requiredPlan ? ` · plano ${post.requiredPlan.name}` : ''}
                    {' · '}
                    {timeAgo(post.publishedAt || post.createdAt)}
                  </SizableText>
                </YStack>

                <StatusTag post={post} />
              </XStack>
            </Link>
          ))}
        </YStack>
      )}
    </AdminSection>
  )
})

const StatusTag = ({ post }: { post: any }) => {
  const { label, color } = post.deleted
    ? ({ label: 'apagado', color: '$red10' } as const)
    : post.published
      ? ({ label: 'publicado', color: '$green10' } as const)
      : ({ label: 'rascunho', color: '$color10' } as const)

  return (
    <XStack px="$2" py="$0.5" rounded="$12" borderWidth={1} borderColor={color}>
      <SizableText size="$1" fontWeight="600" color={color}>
        {label}
      </SizableText>
    </XStack>
  )
}
