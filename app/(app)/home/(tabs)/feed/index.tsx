import { memo } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isWeb, ScrollView, SizableText, Spinner, YStack } from 'tamagui'

import { MASTER_USER_ID } from '~/constants/creator'
import { useFeed } from '~/data/client/hooks'
import { PostCard } from '~/features/feed/PostCard'
import { Button } from '~/interface/buttons/Button'

import type { FeedPost } from '~/features/feed/types'

export const HomePage = memo(() => {
  const insets = useSafeAreaInsets()

  // Paginação por cursor keyset: o "limite crescente" existia por causa da reatividade
  // do Zero, que sincronizava o incremento em vez da janela inteira. Sem ela, refazer
  // os 20 primeiros a cada "Carregar mais" seria desperdício puro.
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = useFeed()

  const rows = data?.pages.flatMap((page) => page.posts) ?? []

  // 🔴 `isPending`, não `isFetching`: revalidação por foco não pode piscar a lista.
  // Spinner só na primeira carga, com o cache vazio.
  const isLoading = isPending

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

          {hasNextPage ? (
            <YStack py="$5" items="center">
              <Button
                variant="outlined"
                size="$3"
                disabled={isFetchingNextPage}
                onPress={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
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
