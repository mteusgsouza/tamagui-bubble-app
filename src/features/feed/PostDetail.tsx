import { memo } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { Avatar } from '~/interface/avatars/Avatar'
import { ChatCircleIcon } from '~/interface/icons/phosphor/ChatCircleIcon'

import { CommentList } from './CommentList'
import { CreatorBadge } from './CreatorBadge'
import { fullDate, visibilityLabel } from './formatDate'
import { LikeButton } from './LikeButton'
import { PostMediaCarousel } from './PostMediaCarousel'
import { postMediaItems } from './types'

import type { FeedPost } from './types'

/**
 * O post inteiro: sem corte no corpo, mídia em carrossel e a thread de comentários.
 *
 * Vindo do card, isto resolve no cache local sem round-trip — `feedPosts` e
 * `postDetail` pedem a mesma forma, só mudando o limite de comentários.
 */
export const PostDetail = memo(({ post }: { post: FeedPost }) => {
  const author = post.feedOwner
  const name = author?.name || 'Criador'
  const media = postMediaItems(post)

  // parágrafos: o corpo é texto puro, quebra dupla separa blocos
  const paragraphs = (post.body ?? '').split(/\n{2,}/).filter(Boolean)

  return (
    <YStack data-testid="post-detail" gap="$4" py="$4">
      <XStack gap="$2.5" items="center">
        <Avatar size={40} image={author?.image} name={name} />

        <YStack flex={1} gap="$0.5">
          <XStack gap="$2" items="center">
            <SizableText size="$4" fontWeight="600">
              {name}
            </SizableText>
            <CreatorBadge />
          </XStack>

          <SizableText size="$2" color="$color10">
            {fullDate(post.publishedAt)} · {visibilityLabel(post.visibility)}
          </SizableText>
        </YStack>
      </XStack>

      {post.title ? (
        <SizableText size="$8" fontWeight="700" lineHeight={32}>
          {post.title}
        </SizableText>
      ) : null}

      {media.length > 0 ? (
        <PostMediaCarousel items={media} alt={post.title || name} />
      ) : null}

      {paragraphs.length > 0 ? (
        <YStack gap="$3">
          {paragraphs.map((paragraph, index) => (
            <SizableText
              // o corpo é imutável dentro de um render; índice é chave estável aqui
              key={index}
              size="$5"
              color="$color11"
              lineHeight={26}
            >
              {paragraph}
            </SizableText>
          ))}
        </YStack>
      ) : null}

      <XStack gap="$5" items="center" py="$2">
        <LikeButton
          postId={post.id}
          likeCount={post.likeCount}
          liked={(post.reactions?.length ?? 0) > 0}
          size={20}
        />

        <XStack gap="$1.5" items="center">
          <ChatCircleIcon size={20} color="$color10" />
          <SizableText size="$3" fontWeight="600" color="$color11">
            {post.commentCount}
          </SizableText>
        </XStack>
      </XStack>

      <YStack height={1} bg="$borderColor" />

      <CommentList
        postId={post.id}
        feedOwnerId={post.feedOwnerId}
        comments={post.comments ?? []}
        commentCount={post.commentCount}
      />
    </YStack>
  )
})
