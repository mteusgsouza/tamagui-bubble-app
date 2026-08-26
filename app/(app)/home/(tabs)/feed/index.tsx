import { memo } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { isWeb, ScrollView, SizableText, YStack } from 'tamagui'

import { H1 } from '~/interface/text/Headings'

export const HomePage = memo(() => {
  const insets = useSafeAreaInsets()

  const content = (
    <YStack
      position="relative"
      flexBasis="auto"
      bg="$background"
      flex={1}
      {...(isWeb && {
        width: '100vw' as any,
        ml: '50%' as any,
        transform: 'translateX(-50%)' as any,
        minHeight: '100vh' as any,
      })}
    >
      <YStack
        pb={isWeb ? '$10' : insets.bottom + 40}
        gap="$6"
        px="$4"
        width="100%"
        maxW={1200}
        mx="auto"
        flex={1}
      >
        <YStack flex={1} gap="$3" pt="$4" items="center" justify="center">
          <H1 size="$6">Feed</H1>
          <SizableText size="$4" opacity={0.6}>
            No posts yet.
          </SizableText>
        </YStack>
      </YStack>
    </YStack>
  )

  if (isWeb) {
    return content
  }

  return (
    <ScrollView flex={1} pt={insets.top + 16}>
      {content}
    </ScrollView>
  )
})
