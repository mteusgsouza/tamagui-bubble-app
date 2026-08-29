import { memo, useState } from 'react'
import { ScrollView, SizableText, XStack, YStack } from 'tamagui'

import { MediaView } from '~/features/media/MediaView'

import type { MediaViewMedia } from '~/features/media/MediaFrame'
import type { LayoutChangeEvent } from 'react-native'

type Props = {
  items: readonly MediaViewMedia[]
  /** `false` segura o carregamento — item fora da viewport numa lista longa */
  enabled?: boolean
  alt?: string
}

/**
 * Mídias do post em carrossel horizontal, com o indicador "1/3" do mock.
 *
 * A largura vem do `onLayout` porque `pagingEnabled` precisa que cada slide tenha
 * exatamente a largura do viewport — percentual não serve dentro de um ScrollView
 * horizontal. Por isso nada é renderizado antes da primeira medição.
 */
export const PostMediaCarousel = memo(({ items, enabled = true, alt }: Props) => {
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState(0)

  if (items.length === 0) return null

  // uma mídia só não é carrossel: sem ScrollView, sem medir, sem indicador
  if (items.length === 1) {
    return <MediaView media={items[0]!} enabled={enabled} alt={alt} />
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width)
    if (next > 0 && next !== width) setWidth(next)
  }

  return (
    <YStack position="relative" width="100%" onLayout={onLayout}>
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / width)
            if (next !== index) setIndex(next)
          }}
        >
          {items.map((media) => (
            <YStack key={media.id} width={width}>
              <MediaView media={media} enabled={enabled} alt={alt} />
            </YStack>
          ))}
        </ScrollView>
      ) : (
        // reserva a altura antes de medir, para o feed não pular
        <YStack aspectRatio={16 / 9} bg="$color2" rounded="$6" />
      )}

      <XStack
        position="absolute"
        t="$2"
        r="$2"
        px="$2"
        py="$0.5"
        rounded="$4"
        bg="rgba(0,0,0,0.65)"
        pointerEvents="none"
      >
        <SizableText size="$1" color="white" fontWeight="600">
          {index + 1}/{items.length}
        </SizableText>
      </XStack>
    </YStack>
  )
})
