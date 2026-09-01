import { memo, useEffect, useRef, useState } from 'react'
import { isWeb, SizableText, Spinner, useMedia, XStack, YStack } from 'tamagui'

import { BOTTOM_BAR_HEIGHT } from '~/constants/navigation'
import { useAuth } from '~/features/auth/client/authClient'
import { newId } from '~/helpers/id'
import { Avatar } from '~/interface/avatars/Avatar'
import { Pressable } from '~/interface/buttons/Pressable'
import { TextArea } from '~/interface/forms/TextArea'
import { zero } from '~/zero/client'

import { CreatorBadge } from './CreatorBadge'
import { plural, timeAgo } from './formatDate'

import type { FeedComment } from './types'

type Props = {
  postId: string
  /** dono do feed: quem ganha o selo "Criador" na lista */
  feedOwnerId: string
  comments: readonly FeedComment[]
  commentCount: number
}

/**
 * Alvo de uma resposta. `parentId` é sempre o comentário **raiz**, nunca uma resposta:
 * a thread tem um nível só (`comment.parentId` aponta para o raiz), então responder a
 * uma resposta pendura no mesmo raiz. `name` é de quem se está respondendo, que pode
 * ser outra pessoa — é o que o composer mostra.
 */
type ReplyTarget = { parentId: string; name: string }

/** Recuo das respostas: alinha com o texto do comentário pai (avatar 34 + gap 10). */
const REPLY_INDENT = 44

/** Acima disto a thread nasce fechada. Ver `CommentThread`. */
const MAX_REPLIES_ALWAYS_OPEN = 2

/**
 * Altura reservada para a barra do composer quando ela é fixa. É o respiro que o fim
 * da lista precisa para não morrer atrás dela.
 */
const COMPOSER_BAR_HEIGHT = 74

/** Até onde o campo cresce enquanto se escreve — ~4 linhas. Depois disso, rola. */
const COMPOSER_MAX_INPUT_HEIGHT = 84

/**
 * Comentários no formato das redes sociais.
 *
 * Três coisas mudaram em relação à primeira versão, e cada uma resolve algo que doía
 * só no celular:
 *
 * 1. **A lista vem primeiro.** O composer era um bloco de ~130px no topo (textarea de
 *    72px + botão numa linha própria) e empurrava todo comentário para fora da
 *    primeira tela. Abrir um post e não ver comentário nenhum é o problema que o
 *    print mostrava.
 * 2. **No celular o composer é barra fixa** logo acima da barra de abas, como no
 *    Instagram e no X: responder não exige rolar até o fim. No desktop e no nativo ele
 *    continua no fluxo, no fim da lista — `position: fixed` não existe no React Native,
 *    e pinar no nativo pediria `KeyboardAvoidingView`, que é outra história.
 * 3. **Thread longa nasce fechada** atrás de "Ver N respostas". Uma thread de três
 *    respostas comia 300px de rolagem antes do próximo comentário raiz.
 */
export const CommentList = memo(
  ({ postId, feedOwnerId, comments, commentCount }: Props) => {
    const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
    const media = useMedia()

    // `$md` é `minWidth: 768` nesta config (Tamagui v5, mobile-first): fora dele é
    // celular. `useMedia` e não prop `$md` porque a diferença não é de estilo, é de
    // estrutura — a barra fixa ganha uma moldura própria e um espaçador na lista.
    const pinned = isWeb && !media.md

    const roots = comments.filter((comment) => !comment.parentId && !comment.deleted)

    const composer = (
      <CommentComposer
        postId={postId}
        replyTo={replyTo}
        onDone={() => setReplyTo(null)}
        pinned={pinned}
      />
    )

    return (
      <YStack gap="$2">
        <SizableText size="$3" fontWeight="700" color="$color11">
          {plural(commentCount, 'comentário', 'comentários')}
        </SizableText>

        {roots.length === 0 ? (
          <YStack py="$5" gap="$1" items="center">
            <SizableText size="$4" fontWeight="600">
              Ninguém comentou ainda
            </SizableText>
            <SizableText size="$2" color="$color10">
              Comece a conversa.
            </SizableText>
          </YStack>
        ) : (
          <YStack>
            {roots.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                feedOwnerId={feedOwnerId}
                onReply={setReplyTo}
              />
            ))}
          </YStack>
        )}

        {pinned ? (
          <>
            {/* a barra é `fixed`, logo saiu do fluxo: sem este respiro o último
                comentário fica embaixo dela e da barra de abas, sem como rolar */}
            <YStack
              $platform-web={{
                height:
                  `calc(${COMPOSER_BAR_HEIGHT + BOTTOM_BAR_HEIGHT}px + env(safe-area-inset-bottom))` as any,
              }}
            />
            {composer}
          </>
        ) : (
          <YStack pt="$3">{composer}</YStack>
        )}
      </YStack>
    )
  },
)

/**
 * Um comentário raiz com as respostas dele.
 *
 * Até duas respostas ficam abertas: esconder uma resposta só custa um toque para
 * economizar duas linhas, não vale. Da terceira em diante a thread vira paredão no
 * celular e passa a nascer fechada, atrás de "Ver N respostas".
 */
const CommentThread = ({
  comment,
  feedOwnerId,
  onReply,
}: {
  comment: FeedComment
  feedOwnerId: string
  onReply: (target: ReplyTarget) => void
}) => {
  const replies = (comment.replies ?? []).filter((reply) => !reply.deleted)
  const collapsible = replies.length > MAX_REPLIES_ALWAYS_OPEN

  const [open, setOpen] = useState(false)
  const showing = open || !collapsible

  return (
    <YStack>
      <CommentItem comment={comment} feedOwnerId={feedOwnerId} onReply={onReply} />

      {replies.length > 0 ? (
        <YStack pl={REPLY_INDENT}>
          {collapsible ? (
            <Pressable
              onPress={() => setOpen((value) => !value)}
              role="button"
              hoverStyle={{ opacity: 0.7 }}
            >
              <XStack gap="$2" items="center" py="$1.5">
                {/* o tracinho é o que separa "ver respostas" de mais uma ação do
                    comentário — no Instagram é ele que denuncia a thread */}
                <YStack width={22} height={1} bg="$color7" />
                <SizableText size="$2" fontWeight="600" color="$color10">
                  {open
                    ? 'Ocultar respostas'
                    : `Ver ${plural(replies.length, 'resposta', 'respostas')}`}
                </SizableText>
              </XStack>
            </Pressable>
          ) : null}

          {showing
            ? replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  feedOwnerId={feedOwnerId}
                  onReply={onReply}
                  isReply
                />
              ))
            : null}
        </YStack>
      ) : null}
    </YStack>
  )
}

const CommentItem = ({
  comment,
  feedOwnerId,
  onReply,
  isReply,
}: {
  comment: FeedComment
  feedOwnerId: string
  onReply: (target: ReplyTarget) => void
  isReply?: boolean
}) => {
  const { user } = useAuth()
  const author = comment.user
  const name = author?.name || 'Alguém'
  const isCreator = comment.userId === feedOwnerId
  const isMine = comment.userId === user?.id

  return (
    <XStack gap="$2.5" items="flex-start" py="$2">
      <Avatar size={isReply ? 28 : 34} image={author?.image} name={name} />

      <YStack flex={1} gap="$1">
        {/* nome, selo e tempo na mesma linha. A largura do celular é do corpo do
            comentário; metadado que ocupa linha própria é linha desperdiçada */}
        <XStack gap="$1.5" items="center" flexWrap="wrap">
          <SizableText size="$3" fontWeight="600">
            {name}
          </SizableText>

          {isCreator ? <CreatorBadge small /> : null}

          <SizableText size="$2" color="$color10">
            {timeAgo(comment.createdAt)}
          </SizableText>
        </XStack>

        <SizableText size="$3" color="$color12" lineHeight={20}>
          {comment.body}
        </SizableText>

        <XStack gap="$4" items="center">
          <CommentAction
            label="Responder"
            onPress={() =>
              onReply({
                // numa resposta, o pai continua sendo o raiz dela
                parentId: (isReply ? comment.parentId : comment.id) || comment.id,
                name,
              })
            }
          />
          {isMine ? (
            <CommentAction
              label="Apagar"
              onPress={() => zero.mutate.comment.softDelete({ id: comment.id })}
            />
          ) : null}
        </XStack>
      </YStack>
    </XStack>
  )
}

const CommentAction = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable onPress={onPress} hoverStyle={{ opacity: 0.7 }} role="button">
    <SizableText size="$2" fontWeight="600" color="$color10">
      {label}
    </SizableText>
  </Pressable>
)

const CommentComposer = ({
  postId,
  replyTo,
  onDone,
  pinned,
}: {
  postId: string
  replyTo: ReplyTarget | null
  onDone: () => void
  pinned: boolean
}) => {
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef<any>(null)

  const canSend = Boolean(body.trim()) && !sending

  // Com `rows={1}` a altura é de uma linha e fica lá: `<textarea>` não cresce sozinho.
  // Então medimos o conteúdo a cada tecla e acompanhamos até quatro linhas, como no
  // Instagram. Só na web — no nativo o `TextInput` multilinha já se ajusta.
  useEffect(() => {
    const element = inputRef.current
    if (!isWeb || !element?.style) return

    // zera antes de medir: `scrollHeight` nunca encolhe abaixo da altura atual
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, COMPOSER_MAX_INPUT_HEIGHT)}px`
  }, [body])

  const submit = async () => {
    const text = body.trim()
    if (!text || sending) return

    setSending(true)
    try {
      // id e timestamp nascem na tela, nunca dentro da mutation
      await zero.mutate.comment.insert({
        id: newId(),
        postId,
        userId: user!.id,
        parentId: replyTo?.parentId,
        body: text,
        deleted: false,
        createdAt: Date.now(),
      })
      setBody('')
      onDone()
    } finally {
      setSending(false)
    }
  }

  const content = !user?.id ? (
    <SizableText size="$3" color="$color10" py="$2">
      Entre para comentar.
    </SizableText>
  ) : (
    <YStack gap="$2">
      {replyTo ? (
        <XStack gap="$2" items="center">
          <SizableText size="$2" color="$color10" flex={1} numberOfLines={1}>
            Respondendo a {replyTo.name}
          </SizableText>
          <CommentAction label="Cancelar" onPress={onDone} />
        </XStack>
      ) : null}

      <XStack gap="$2.5" items="center">
        <Avatar size={32} image={user.image} name={user.name ?? 'Você'} />

        {/* pílula única: campo e ação de enviar na mesma linha. O bloco antigo era
            textarea + botão embaixo, dois toques de altura para um comentário de
            uma linha.

            O respiro vertical é **da pílula**, não do campo: assim o `items="center"`
            centraliza campo e "Enviar" um contra o outro. Padding dentro do textarea
            faria o texto começar no topo de uma caixa mais alta que a linha. */}
        <XStack
          flex={1}
          items="center"
          gap="$2"
          pl="$3.5"
          pr="$3"
          py="$2.5"
          rounded="$10"
          bg="$color2"
          borderWidth={1}
          borderColor="$borderColor"
        >
          <TextArea
            ref={inputRef}
            data-testid="comment-input"
            flex={1}
            value={body}
            onChangeText={setBody}
            placeholder={
              replyTo ? `Responder a ${replyTo.name}…` : 'Escreva um comentário…'
            }
            size="$3"
            // ⚠️ `rows` é o que define a altura no Tamagui — `height = rows × lineHeight`
            // (`textAreaSizeVariant`), e ele ignora `minH`/`maxH`. O padrão é 3, que é
            // de onde vinha a caixa de 63px com o texto grudado no topo.
            rows={1}
            px={0}
            py={0}
            borderWidth={0}
            bg="transparent"
            focusVisibleStyle={{ outlineWidth: 0, borderWidth: 0 }}
            // sem isto o `<textarea>` da web desenha a alcinha de redimensionar no
            // canto da pílula, e ela deixa arrastar o campo para fora da moldura
            $platform-web={{ resize: 'none' as any }}
          />

          {sending ? (
            <Spinner size="small" color="$accent9" />
          ) : (
            <Pressable
              onPress={submit}
              disabled={!canSend}
              role="button"
              aria-label="Enviar comentário"
              hoverStyle={{ opacity: 0.7 }}
            >
              <SizableText
                size="$3"
                fontWeight="700"
                color={canSend ? '$accent11' : '$color8'}
              >
                Enviar
              </SizableText>
            </Pressable>
          )}
        </XStack>
      </XStack>
    </YStack>
  )

  if (!pinned) return content

  return (
    <YStack
      l={0}
      r={0}
      z={40}
      bg="$background"
      borderTopWidth={1}
      borderColor="$borderColor"
      px="$4"
      py="$2.5"
      $platform-web={{
        position: 'fixed',
        // encosta acima da barra de abas, e o `env()` acompanha a faixa do gesto do
        // iPhone do mesmo jeito que o `AppBottomBar` faz
        bottom: `calc(${BOTTOM_BAR_HEIGHT}px + env(safe-area-inset-bottom))` as any,
      }}
    >
      <YStack width="100%" maxW={620} mx="auto">
        {content}
      </YStack>
    </YStack>
  )
}
