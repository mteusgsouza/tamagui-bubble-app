import { Link } from 'one'
import { memo } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { Avatar } from '~/interface/avatars/Avatar'
import { Button } from '~/interface/buttons/Button'
import { ChatCircleIcon } from '~/interface/icons/phosphor/ChatCircleIcon'
import { LockIcon } from '~/interface/icons/phosphor/LockIcon'

import { CommentList } from './CommentList'
import { CreatorBadge } from './CreatorBadge'
import { fullDate, visibilityLabel } from './formatDate'
import { LikeButton } from './LikeButton'
import { PostMediaCarousel } from './PostMediaCarousel'
import { isPostLocked, postMediaItems } from './types'

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

  const locked = isPostLocked(post)

  // parágrafos: o corpo é texto puro, quebra dupla separa blocos. Bloqueado mostra o
  // teaser — `postContent` não chegou, e não há o que revelar aqui.
  const paragraphs = (locked ? (post.teaser ?? '') : (post.content?.body ?? ''))
    .split(/\n{2,}/)
    .filter(Boolean)

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

      {/* bloqueado não tem o que curtir nem comentários para listar: o servidor não
          sincroniza `comment` nem `reaction` de post pago (Fase 12). Mostrar a lista vazia
          diria "ninguém comentou", que é mentira. */}
      {locked ? (
        <Paywall
          likeCount={post.likeCount}
          commentCount={post.commentCount}
          requiresPlan={Boolean(post.requiredPlanId)}
        />
      ) : (
        <>
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
        </>
      )}
    </YStack>
  )
})

/**
 * O bloco que substitui o post inteiro quando ele está bloqueado.
 *
 * Os contadores continuam à mostra: são prova social, chegam em `post` (que é público
 * desde a Fase 12) e não revelam nada do conteúdo.
 */
const Paywall = ({
  likeCount,
  commentCount,
  requiresPlan,
}: {
  likeCount: number
  commentCount: number
  requiresPlan: boolean
}) => (
  <YStack
    gap="$3"
    p="$4"
    rounded="$7"
    bg="$accent2"
    borderWidth={1}
    borderColor="$accent6"
    items="center"
  >
    <LockIcon size={26} color="$accent10" />

    <SizableText size="$6" fontWeight="700" text="center">
      Este post é para assinantes
    </SizableText>

    <SizableText size="$3" color="$color11" text="center" lineHeight={21}>
      {requiresPlan
        ? 'Ele faz parte de um plano específico. Veja qual libera este conteúdo.'
        : 'Assine para ler o post inteiro, curtir e comentar.'}
    </SizableText>

    <SizableText size="$2" color="$color10">
      {likeCount} curtidas · {commentCount} comentários
    </SizableText>

    <Link href="/assinar" data-testid="post-detail-cta" style={{ width: '100%' }} asChild>
      <Button variant="accent" size="$4" width="100%">
        Ver planos
      </Button>
    </Link>
  </YStack>
)
