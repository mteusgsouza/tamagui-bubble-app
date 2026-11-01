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

import type { Href } from 'one'
import type { ReactNode } from 'react'
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

type Props = {
  post: FeedPost
  /**
   * Prévia do composer: **desenha igual, mas não age**.
   *
   * Sem isto a prévia seria uma armadilha em vez de uma ajuda. Dois motivos concretos,
   * os dois dentro deste componente: o título e o texto vivem num `Link` para
   * `/home/feed/<id>` — num rascunho, isso tira o criador do editor e o joga num post
   * que nem existe; e o `LikeButton` chama a mutation de verdade, porque quem está
   * olhando a prévia está logado.
   *
   * Prop, e não um segundo card: card imitado diverge do original na terceira mudança,
   * e aí a prévia passa a mentir — que é o oposto do que ela existe para fazer.
   */
  preview?: boolean
}

export const PostCard = memo(({ post, preview = false }: Props) => {
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
      {/* ⚠️ O `data-testid` vai no view de dentro, não no `<Link>`: o `Link` do One
          descarta prop desconhecida e o `<a>` sai sem o atributo. Os testes de
          integração procuram por testid, então testid no `Link` faz o teste **pular**
          em silêncio em vez de falhar — foi o que aconteceu com `post-link`,
          `course-card` e `lesson-row` desde que foram escritos. */}
      <OpenPost href={href} preview={preview}>
        <YStack gap="$2" data-testid={preview ? 'preview-post' : 'post-link'}>
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
      </OpenPost>

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
        <LockedActions preview={preview} />
      ) : (
        <XStack gap="$5" items="center" pt="$1">
          <LikeButton
            postId={post.id}
            likeCount={post.likeCount}
            liked={post.liked ?? false}
            readOnly={preview}
          />

          <OpenPost href={href} preview={preview} inline>
            <XStack gap="$1.5" items="center">
              <ChatCircleIcon size={18} color="$color10" />
              <SizableText size="$3" fontWeight="600" color="$color11">
                {post.commentCount}
              </SizableText>
            </XStack>
          </OpenPost>
        </XStack>
      )}
    </YStack>
  )
})

/**
 * Abre o post — ou não abre nada, na prévia.
 *
 * `inline` é para o contador de comentário, que mora dentro de uma linha e não deve
 * esticar: o `Link` da web vira `<a>` inline e precisa do `width: 100%` só onde embrulha
 * um bloco.
 */
const OpenPost = ({
  href,
  preview,
  inline,
  children,
}: {
  href: Href
  preview: boolean
  inline?: boolean
  children: ReactNode
}) => {
  if (preview) {
    return inline ? <>{children}</> : <YStack width="100%">{children}</YStack>
  }

  return (
    <Link href={href} style={inline ? undefined : { width: '100%' }}>
      {children}
    </Link>
  )
}

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
const LockedActions = ({ preview }: { preview: boolean }) => (
  <XStack gap="$3" items="center" justify="space-between" pt="$1" flexWrap="wrap">
    <XStack gap="$1.5" items="center" flex={1}>
      <LockIcon size={15} color="$color10" />
      <SizableText size="$2" color="$color10">
        Assine para ler, curtir e comentar
      </SizableText>
    </XStack>

    {/* na prévia o botão aparece (é parte do que o criador precisa ver) mas não leva a
        `/assinar`: quem está olhando é o dono do conteúdo */}
    {preview ? (
      <Button variant="accent" size="$2" disabled>
        Assinar
      </Button>
    ) : (
      <Link href="/assinar" data-testid="post-card-cta" asChild>
        <Button variant="accent" size="$2">
          Assinar
        </Button>
      </Link>
    )}
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
