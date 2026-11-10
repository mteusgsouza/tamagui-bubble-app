import { Link } from 'one'
import { SizableText, XStack, YStack } from 'tamagui'

import { fullDate } from '~/features/feed/formatDate'

type Props = {
  code: string
  issuedAt?: number | null
  /** o que aparece em cima do botão; padrão serve ao fim do curso */
  title?: string
}

/** O certificado de quem terminou o curso — leva à página de verificação/impressão. */
export const CertificateLink = ({ code, issuedAt, title = 'Curso concluído 🎓' }: Props) => (
  <Link href={`/certificado/${code}` as any} style={{ width: '100%' }} data-testid="certificate-link">
    <XStack
      gap="$3"
      p="$3.5"
      items="center"
      rounded="$6"
      borderWidth={1}
      borderColor="$accent7"
      bg="$accent2"
      width="100%"
    >
      <YStack flex={1} gap="$0.5">
        <SizableText size="$4" fontWeight="700" color="$accent11">
          {title}
        </SizableText>
        <SizableText size="$2" color="$color11">
          Ver certificado{issuedAt ? ` · emitido em ${fullDate(issuedAt).split(',')[0]}` : ''}
        </SizableText>
      </YStack>
    </XStack>
  </Link>
)
