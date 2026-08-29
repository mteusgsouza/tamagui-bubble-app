import { useParams, useRouter, createRoute } from 'one'
import { memo } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isWeb, ScrollView, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { postDetail } from '~/data/queries/feed'
import { useAuth } from '~/features/auth/client/authClient'
import { PostDetail } from '~/features/feed/PostDetail'
import { Pressable } from '~/interface/buttons/Pressable'
import { CaretLeftIcon } from '~/interface/icons/phosphor/CaretLeftIcon'
import { useQuery } from '~/zero/client'

import type { FeedPost } from '~/features/feed/types'

const route = createRoute<'/(app)/home/(tabs)/feed/[postId]'>()

export const PostDetailPage = memo(() => {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { postId } = useParams<{ postId?: string }>()

  // useAuth, não useUser: o id vem do JWT na hora, sem consultar o banco
  const { user } = useAuth()
  const userId = user?.id || ''

  const [post, status] = useQuery(
    postDetail,
    { postId: postId || '', userId },
    { enabled: Boolean(postId && userId) },
  )

  const isLoading = status?.type !== 'complete' && !post

  const content = (
    <YStack bg="$background" flex={1} width="100%" maxW={620} mx="auto" px="$4">
      <XStack items="center" gap="$3" py="$3">
        <Pressable onPress={() => router.back()} role="button" aria-label="Voltar">
          <CaretLeftIcon size={24} />
        </Pressable>
        <SizableText size="$5" fontWeight="700">
          Post
        </SizableText>
      </XStack>

      {isLoading ? (
        <YStack flex={1} items="center" justify="center" py="$10">
          <Spinner size="small" color="$accent9" />
        </YStack>
      ) : !post ? (
        // some do sync tanto post apagado quanto post que o paywall barra: para o
        // cliente os dois são a mesma coisa — a linha não existe
        <YStack flex={1} gap="$2" items="center" justify="center" py="$10">
          <SizableText size="$6" fontWeight="700">
            Post indisponível
          </SizableText>
          <SizableText size="$4" color="$color10" text="center">
            Ele pode ter sido removido, ou faz parte de um plano que você ainda não
            assina.
          </SizableText>
        </YStack>
      ) : (
        <PostDetail post={post as FeedPost} />
      )}
    </YStack>
  )

  if (isWeb) {
    return (
      <YStack bg="$background" flex={1} {...({ minHeight: '100vh' } as any)}>
        {content}
      </YStack>
    )
  }

  return (
    <ScrollView flex={1} bg="$background" pt={insets.top}>
      {content}
      <YStack height={insets.bottom + 40} />
    </ScrollView>
  )
})
