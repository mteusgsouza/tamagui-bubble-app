import { memo } from 'react'
import { SizableText, XStack } from 'tamagui'

import { useAuth } from '~/features/auth/client/authClient'
import { newId } from '~/helpers/id'
import { Pressable } from '~/interface/buttons/Pressable'
import { HeartFillIcon } from '~/interface/icons/phosphor/HeartFillIcon'
import { HeartIcon } from '~/interface/icons/phosphor/HeartIcon'
import { zero } from '~/zero/client'

type Props = {
  postId: string
  likeCount: number
  /** vem de `post.reactions` — a query já traz só a reação de quem está olhando */
  liked: boolean
  size?: number
}

/**
 * Curtir é `toggle`, não insert: existe índice único em
 * `(postId, userId, type)` e a segunda curtida estouraria no Postgres.
 *
 * `newId()` e `Date.now()` nascem **aqui**, nunca dentro da mutation — ela roda no
 * cliente (otimista) e no servidor (autoritativa), e as duas execuções precisam
 * convergir. O id só é usado quando a reação ainda não existe.
 */
export const LikeButton = memo(({ postId, likeCount, liked, size = 18 }: Props) => {
  const { user } = useAuth()

  const onPress = () => {
    if (!user?.id) return
    zero.mutate.reaction.toggle({
      id: newId(),
      postId,
      userId: user.id,
      type: 'like',
      createdAt: Date.now(),
    })
  }

  const Icon = liked ? HeartFillIcon : HeartIcon

  return (
    <Pressable
      onPress={onPress}
      disabled={!user?.id}
      role="button"
      aria-label={liked ? 'Descurtir' : 'Curtir'}
      hoverStyle={{ opacity: 0.7 }}
    >
      <XStack gap="$1.5" items="center">
        <Icon size={size} color={liked ? '$accent9' : '$color10'} />
        <SizableText size="$3" fontWeight="600" color={liked ? '$accent11' : '$color11'}>
          {likeCount}
        </SizableText>
      </XStack>
    </Pressable>
  )
})
