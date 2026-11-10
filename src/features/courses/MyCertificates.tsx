import { Link } from 'one'
import { SizableText, XStack, YStack } from 'tamagui'

import { useMyCertificates } from '~/data/client/hooks'
import { fullDate } from '~/features/feed/formatDate'

/** "Meus certificados", em Ajustes. Some sozinho enquanto não houver nenhum. */
export const MyCertificates = () => {
  const certificates = useMyCertificates().data?.certificates ?? []
  if (!certificates.length) return null

  return (
    <YStack gap="$2" px="$4" pb="$5" data-testid="my-certificates">
      <SizableText size="$5" fontWeight="700">
        Meus certificados
      </SizableText>
      {certificates.map((item) => (
        <Link key={item.code} href={`/certificado/${item.code}` as any} style={{ width: '100%' }}>
          <XStack
            gap="$3"
            p="$3"
            items="center"
            rounded="$6"
            borderWidth={1}
            borderColor="$borderColor"
            width="100%"
          >
            <YStack flex={1} gap="$0.5">
              <SizableText size="$3" fontWeight="600">
                {item.courseTitle}
              </SizableText>
              <SizableText size="$1" color="$color10">
                Emitido em {fullDate(item.issuedAt).split(',')[0]}
              </SizableText>
            </YStack>
          </XStack>
        </Link>
      ))}
    </YStack>
  )
}
