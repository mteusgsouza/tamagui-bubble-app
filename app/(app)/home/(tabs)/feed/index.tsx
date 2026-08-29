import { memo, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isWeb, ScrollView, SizableText, Spinner, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { feedPosts } from '~/data/queries/feed'
import { useAuth } from '~/features/auth/client/authClient'
import { PostCard } from '~/features/feed/PostCard'
import { Button } from '~/interface/buttons/Button'
import { useQuery } from '~/zero/client'

import type { FeedPost } from '~/features/feed/types'

const PAGE_SIZE = 20

export const HomePage = memo(() => {
  const insets = useSafeAreaInsets()
  // useAuth, não useUser: o id vem do JWT na hora, sem consultar o banco
  const { user } = useAuth()
  const userId = user?.id || ''

  // Paginação por limite crescente, e não pelo cursor de `feedPostsPage`.
  // Motivo: uma query reativa só, uma lista só. Com cursor seriam N assinaturas para
  // costurar à mão, e um post apagado no meio deixaria buraco ou linha duplicada.
  // O Zero sincroniza o incremento, não a janela inteira. `feedPostsPage` continua
  // disponível para quando o feed ficar grande a ponto de a janela pesar.
  const [limit, setLimit] = useState(PAGE_SIZE)

  const [posts, status] = useQuery(
    feedPosts,
    { feedOwnerId: MASTER_USER_ID, userId, limit },
    { enabled: Boolean(userId && MASTER_USER_ID) },
  )

  const rows = posts ?? []
  const isComplete = status?.type === 'complete'
  const isLoading = !isComplete && rows.length === 0
  // veio menos do que pediu = acabou o feed
  const hasMore = isComplete && rows.length >= limit

  const content = (
    <YStack bg="$background" flex={1} width="100%" maxW={620} mx="auto" px="$4">
      {!MASTER_USER_ID ? (
        <Empty
          title="Feed sem dono"
          detail="VITE_MASTER_USER_ID está vazio no .env.development."
        />
      ) : isLoading ? (
        <YStack flex={1} items="center" justify="center" py="$10">
          <Spinner size="small" color="$accent9" />
        </YStack>
      ) : rows.length === 0 ? (
        <Empty
          title="Nada por aqui ainda"
          detail="Quando o criador publicar, aparece nesta tela."
        />
      ) : (
        <>
          {rows.map((post) => (
            <PostCard key={post.id} post={post as FeedPost} />
          ))}

          {hasMore ? (
            <YStack py="$5" items="center">
              <Button
                variant="outlined"
                size="$3"
                onPress={() => setLimit((current) => current + PAGE_SIZE)}
              >
                Carregar mais
              </Button>
            </YStack>
          ) : (
            <YStack py="$6" items="center">
              <SizableText size="$2" color="$color9">
                Você chegou ao começo.
              </SizableText>
            </YStack>
          )}
        </>
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
    <ScrollView flex={1} bg="$background" pt={insets.top + 16}>
      {content}
      <YStack height={insets.bottom + 40} />
    </ScrollView>
  )
})

const Empty = ({ title, detail }: { title: string; detail: string }) => (
  <YStack flex={1} gap="$2" items="center" justify="center" py="$10">
    <SizableText size="$6" fontWeight="700">
      {title}
    </SizableText>
    <SizableText size="$4" color="$color10" text="center">
      {detail}
    </SizableText>
  </YStack>
)
