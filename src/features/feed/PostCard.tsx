import { Link } from 'one'
import { memo } from 'react'
import { Separator, SizableText, XStack, YStack } from 'tamagui'

import { Avatar } from '~/interface/avatars/Avatar'
import { ChatCircleIcon } from '~/interface/icons/phosphor/ChatCircleIcon'

import { CreatorBadge } from './CreatorBadge'
import { timeAgo, visibilityLabel } from './formatDate'
import { LikeButton } from './LikeButton'
import { PostMediaCarousel } from './PostMediaCarousel'
import { postMediaItems } from './types'

import type { FeedPost } from './types'

// acima disso o corpo é cortado e ganha "… ver mais". Corte por caractere, e não
// `numberOfLines`, para o card medir igual na web e no nativo.
const BODY_LIMIT = 240

const KIND_LABEL: Record<string, string> = {
  text: '',
  photo: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
}

export const PostCard = memo(({ post }: { post: FeedPost }) => {
  const author = post.feedOwner
  const name = author?.name || 'Criador'
  const media = postMediaItems(post)
  const href = `/home/feed/${post.id}` as const

  const body = post.body ?? ''
  const isLong = body.length > BODY_LIMIT
  const shownBody = isLong ? `${body.slice(0, BODY_LIMIT).trimEnd()}…` : body

  return (
    <YStack
      data-testid="post-card"
      gap="$3"
      py="$4"
      borderBottomWidth={1}
      borderColor="$borderColor"
    >
      <XStack gap="$2.5" items="center">
        <Avatar size={36} image={author?.image} name={name} />

        <YStack flex={1} gap="$0.5">
          <XStack gap="$2" items="center">
            <SizableText size="$4" fontWeight="600">
              {name}
            </SizableText>
            <CreatorBadge />
          </XStack>

          <SizableText size="$2" color="$color10">
            {timeAgo(post.publishedAt)} · {visibilityLabel(post.visibility)}
          </SizableText>
        </YStack>
      </XStack>

      {/* só o texto abre o post: mídia dentro do link roubaria o toque do player.
          `width: 100%` porque na web o Link vira um `<a>` inline e o bloco de dentro
          não esticaria sozinho */}
      <Link href={href} data-testid="post-link" style={{ width: '100%' }}>
        <YStack gap="$2">
          {post.title ? (
            <SizableText size="$6" fontWeight="700" lineHeight={25}>
              {post.title}
            </SizableText>
          ) : null}

          {shownBody ? (
            <SizableText size="$4" color="$color11" lineHeight={23}>
              {shownBody}
              {isLong ? (
                <SizableText size="$4" color="$accent11" fontWeight="600">
                  {' '}
                  ver mais
                </SizableText>
              ) : null}
            </SizableText>
          ) : null}
        </YStack>
      </Link>

      {media.length > 0 ? (
        <PostMediaCarousel items={media} alt={post.title || KIND_LABEL[post.kind]} />
      ) : post.kind !== 'text' ? (
        <EmptyMediaSlot kind={post.kind} />
      ) : null}

      <XStack gap="$5" items="center" pt="$1">
        <LikeButton
          postId={post.id}
          likeCount={post.likeCount}
          liked={(post.reactions?.length ?? 0) > 0}
        />

        <Link href={href}>
          <XStack gap="$1.5" items="center">
            <ChatCircleIcon size={18} color="$color10" />
            <SizableText size="$3" fontWeight="600" color="$color11">
              {post.commentCount}
            </SizableText>
          </XStack>
        </Link>
      </XStack>
    </YStack>
  )
})

/**
 * Post que se diz de mídia mas não tem linha em `postMedia` — acontece entre criar o
 * post e o upload terminar. Mostra o lugar em vez de sumir com ele.
 */
const EmptyMediaSlot = ({ kind }: { kind: string }) => (
  <YStack
    height={kind === 'audio' ? 92 : 200}
    rounded="$6"
    bg="$color2"
    borderWidth={1}
    borderColor="$borderColor"
    items="center"
    justify="center"
    gap="$2"
  >
    <SizableText size="$2" color="$accent11" fontWeight="600">
      {KIND_LABEL[kind]}
    </SizableText>
    <SizableText size="$1" color="$color9">
      sem mídia anexada
    </SizableText>
  </YStack>
)

export const FeedSeparator = () => <Separator borderColor="$borderColor" />
