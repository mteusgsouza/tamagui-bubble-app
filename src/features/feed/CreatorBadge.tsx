import { SizableText, XStack } from 'tamagui'

/** Selo do dono do feed. Aparece no card, no detalhe e nos comentários dele. */
export const CreatorBadge = ({ small }: { small?: boolean }) => (
  <XStack
    px={small ? '$1.5' : '$2'}
    py="$0.5"
    rounded="$12"
    borderWidth={1}
    borderColor="$accent7"
  >
    <SizableText size="$1" fontWeight="600" color="$accent11">
      Criador
    </SizableText>
  </XStack>
)
