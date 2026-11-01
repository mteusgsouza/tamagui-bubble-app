import { memo } from 'react'
import { SizableText, XStack } from 'tamagui'

import { useToggleLike } from '~/data/client/mutations'
import { useAuth } from '~/features/auth/client/authClient'
import { Pressable } from '~/interface/buttons/Pressable'
import { HeartFillIcon } from '~/interface/icons/phosphor/HeartFillIcon'
import { HeartIcon } from '~/interface/icons/phosphor/HeartIcon'

type Props = {
  postId: string
  likeCount: number
  /** vem de `post.liked` — o servidor já achata a reação de quem está olhando */
  liked: boolean
  size?: number
  /**
   * Desenha, mas não escreve. É a prévia do composer: lá o criador está logado, então o
   * botão **funcionaria** — um clique curtindo o próprio rascunho grava em `reaction` de
   * verdade, e o número volta diferente do que a prévia prometeu.
   */
  readOnly?: boolean
}

/**
 * Curtir manda **estado desejado**, não "inverta".
 *
 * 🔴 Toggle não é idempotente: duplo-toque, retry de rede e o retry do cliente
 * convergem para estados diferentes — dois toggles voltam ao começo, três invertem.
 * Mandando `liked: !liked`, qualquer repetição converge, e o corpo diz exatamente o que
 * a UI otimista já pintou. O id e o timestamp nascem no servidor agora; a convergência
 * que exigia `newId()` aqui era uma restrição do Zero, que executava a mutation duas
 * vezes.
 */
export const LikeButton = memo(
  ({ postId, likeCount, liked, size = 18, readOnly = false }: Props) => {
    const { user } = useAuth()
    const toggle = useToggleLike()

    const onPress = () => {
      if (readOnly || !user?.id) return
      toggle.mutate({ postId, liked: !liked })
    }

    const Icon = liked ? HeartFillIcon : HeartIcon

    return (
      <Pressable
        onPress={onPress}
        disabled={readOnly || !user?.id}
        role="button"
        aria-label={liked ? 'Descurtir' : 'Curtir'}
        hoverStyle={readOnly ? undefined : { opacity: 0.7 }}
      >
        <XStack gap="$1.5" items="center">
          <Icon size={size} color={liked ? '$accent9' : '$color10'} />
          <SizableText
            size="$3"
            fontWeight="600"
            color={liked ? '$accent11' : '$color11'}
          >
            {likeCount}
          </SizableText>
        </XStack>
      </Pressable>
    )
  },
)
