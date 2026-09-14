import { Link } from 'one'
import { memo } from 'react'
import { Separator, SizableText, XStack, YStack } from 'tamagui'

import { Avatar } from '~/interface/avatars/Avatar'
import { Button } from '~/interface/buttons/Button'
import { ChatCircleIcon } from '~/interface/icons/phosphor/ChatCircleIcon'
import { LockIcon } from '~/interface/icons/phosphor/LockIcon'

import { CreatorBadge } from './CreatorBadge'
import { timeAgo, visibilityLabel } from './formatDate'
import { LikeButton } from './LikeButton'
import { PostMediaCarousel } from './PostMediaCarousel'
import { isPostLocked, postMediaItems } from './types'

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

  // bloqueado = o servidor não sincronizou `postContent`. Aí o que se mostra é o teaser,
  // que é público de propósito — é ele que dá motivo para assinar.
  const locked = isPostLocked(post)
  const body = locked ? (post.teaser ?? '') : (post.content?.body ?? '')
  const isLong = !locked && body.length > BODY_LIMIT
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

      {/* bloqueado nunca monta mídia: sem `postMedia` não há `storageKey`, e a tela não
          inventa URL de R2 (invariante 7) */}
      {locked ? (
        <LockedSlot kind={post.kind} />
      ) : media.length > 0 ? (
        <PostMediaCarousel items={media} alt={post.title || KIND_LABEL[post.kind]} />
      ) : post.kind !== 'text' ? (
        <EmptyMediaSlot kind={post.kind} />
      ) : null}

      {locked ? (
        <LockedActions />
      ) : (
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
      )}
    </YStack>
  )
})

/**
 * O lugar da mídia num post bloqueado.
 *
 * Não é a mídia borrada — é o lugar dela. Borrar exigiria receber o arquivo, e o servidor
 * não manda: `canAccessPostMedia` barra a linha antes.
 */
const LockedSlot = ({ kind }: { kind: string }) => (
  <YStack
    height={kind === 'audio' ? 92 : 180}
    rounded="$6"
    bg="$accent2"
    borderWidth={1}
    borderColor="$accent6"
    items="center"
    justify="center"
    gap="$2"
  >
    <LockIcon size={22} color="$accent10" />
    <SizableText size="$2" color="$accent11" fontWeight="600">
      {KIND_LABEL[kind] || 'Conteúdo'} para assinantes
    </SizableText>
  </YStack>
)

/**
 * Curtir e comentar somem, e o "Assinar" toma o lugar deles.
 *
 * ⚠️ Não é botão desabilitado e mudo: sem dizer o motivo, o usuário conclui que o app
 * quebrou. E a recusa de verdade está no servidor desde a Fase 12 — isto aqui é cortesia,
 * não segurança.
 */
const LockedActions = () => (
  <XStack gap="$3" items="center" justify="space-between" pt="$1" flexWrap="wrap">
    <XStack gap="$1.5" items="center" flex={1}>
      <LockIcon size={15} color="$color10" />
      <SizableText size="$2" color="$color10">
        Assine para ler, curtir e comentar
      </SizableText>
    </XStack>

    <Link href="/assinar" data-testid="post-card-cta" asChild>
      <Button variant="accent" size="$2">
        Assinar
      </Button>
    </Link>
  </XStack>
)

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
