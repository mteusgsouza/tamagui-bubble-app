import { useParams, useRouter, createRoute } from 'one'
import { memo } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isWeb, ScrollView, SizableText, Spinner, XStack, YStack } from 'tamagui'

import { usePost } from '~/data/client/hooks'
import { PostDetail } from '~/features/feed/PostDetail'
import { Pressable } from '~/interface/buttons/Pressable'
import { CaretLeftIcon } from '~/interface/icons/phosphor/CaretLeftIcon'

import type { FeedPost } from '~/features/feed/types'

const route = createRoute<'/(app)/home/(tabs)/feed/[postId]'>()

export const PostDetailPage = memo(() => {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { postId } = useParams<{ postId?: string }>()

  // Semeado pelo que o feed já tem em cache (`usePost`), então abrir um post vindo da
  // lista não mostra spinner: o card aparece na hora e os comentários chegam por baixo.
  const { data, isPending, isError } = usePost(postId || '')
  const post = data?.post

  const isLoading = isPending

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
      ) : isError || !post ? (
        // 404 tanto para post apagado quanto para rascunho alheio: a tela não deve
        // revelar que o rascunho existe. O post **bloqueado** não cai aqui — ele vem,
        // com `content: null`, e vira card com isca.
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
