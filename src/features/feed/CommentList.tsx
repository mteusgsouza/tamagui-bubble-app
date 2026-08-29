import { memo, useState } from 'react'
import { SizableText, Spinner, XStack, YStack } from 'tamagui'

import { useAuth } from '~/features/auth/client/authClient'
import { newId } from '~/helpers/id'
import { Avatar } from '~/interface/avatars/Avatar'
import { Button } from '~/interface/buttons/Button'
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

export const CommentList = memo(
  ({ postId, feedOwnerId, comments, commentCount }: Props) => {
    const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)

    const roots = comments.filter((comment) => !comment.parentId && !comment.deleted)

    return (
      <YStack gap="$4">
        <SizableText size="$5" fontWeight="700">
          {plural(commentCount, 'comentário', 'comentários')}
        </SizableText>

        <CommentComposer
          postId={postId}
          replyTo={replyTo}
          onDone={() => setReplyTo(null)}
        />

        {roots.length === 0 ? (
          <SizableText size="$3" color="$color10">
            Ninguém comentou ainda. Comece a conversa.
          </SizableText>
        ) : (
          <YStack gap="$5">
            {roots.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                feedOwnerId={feedOwnerId}
                onReply={setReplyTo}
              />
            ))}
          </YStack>
        )}
      </YStack>
    )
  },
)

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

  const replies = (comment.replies ?? []).filter((reply) => !reply.deleted)

  return (
    <XStack gap="$2.5" items="flex-start">
      <Avatar size={isReply ? 26 : 32} image={author?.image} name={name} />

      <YStack flex={1} gap="$1.5">
        <XStack gap="$2" items="center" flexWrap="wrap">
          <SizableText size="$3" fontWeight="600">
            {name}
          </SizableText>

          {isCreator ? <CreatorBadge small /> : null}

          <SizableText size="$2" color="$color10">
            {timeAgo(comment.createdAt)}
          </SizableText>
        </XStack>

        <SizableText size="$3" color="$color11" lineHeight={21}>
          {comment.body}
        </SizableText>

        <XStack gap="$4" items="center" pt="$0.5">
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

        {replies.length > 0 ? (
          <YStack gap="$4" pt="$3" pl="$2" borderLeftWidth={1} borderColor="$borderColor">
            {replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                feedOwnerId={feedOwnerId}
                onReply={onReply}
                isReply
              />
            ))}
          </YStack>
        ) : null}
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
}: {
  postId: string
  replyTo: ReplyTarget | null
  onDone: () => void
}) => {
  const { user } = useAuth()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  if (!user?.id) {
    return (
      <SizableText size="$3" color="$color10">
        Entre para comentar.
      </SizableText>
    )
  }

  const submit = async () => {
    const text = body.trim()
    if (!text || sending) return

    setSending(true)
    try {
      // id e timestamp nascem na tela, nunca dentro da mutation
      await zero.mutate.comment.insert({
        id: newId(),
        postId,
        userId: user.id,
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

  return (
    <YStack gap="$2">
      {replyTo ? (
        <XStack gap="$2" items="center">
          <SizableText size="$2" color="$color10">
            Respondendo a {replyTo.name}
          </SizableText>
          <CommentAction label="cancelar" onPress={onDone} />
        </XStack>
      ) : null}

      <XStack gap="$2.5" items="flex-start">
        <Avatar size={32} image={user.image} name={user.name ?? 'Você'} />

        <YStack flex={1} gap="$2">
          <TextArea
            data-testid="comment-input"
            value={body}
            onChangeText={setBody}
            placeholder="Escreva um comentário…"
            minH={72}
          />

          <XStack justify="flex-end">
            <Button
              size="$3"
              onPress={submit}
              disabled={!body.trim() || sending}
              opacity={!body.trim() || sending ? 0.5 : 1}
            >
              {sending ? <Spinner size="small" /> : 'Comentar'}
            </Button>
          </XStack>
        </YStack>
      </XStack>
    </YStack>
  )
}
