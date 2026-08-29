// Peças compartilhadas entre `MediaView.tsx` (web) e `MediaView.native.tsx`.
//
// A moldura é a mesma nas duas plataformas para o layout do feed não pular quando a
// mídia está carregando, trancada ou quebrada — o espaço já está reservado.

import { SizableText, Spinner, YStack } from 'tamagui'

import type { MediaKind } from '~/data/models/media'
import type { ReactNode } from 'react'
import type { YStackProps } from 'tamagui'

export type MediaViewMedia = {
  id: string
  kind: MediaKind
  mime?: string | null
  posterKey?: string | null
  durationSec?: number | null
  width?: number | null
  height?: number | null
}

export type MediaViewProps = {
  media: MediaViewMedia
  /** força a proporção; sem ela usa `width`/`height` da mídia */
  aspectRatio?: number
  rounded?: YStackProps['rounded']
  autoPlay?: boolean
  /** texto alternativo da foto */
  alt?: string
  /** `false` segura a busca da URL assinada — útil em lista virtualizada */
  enabled?: boolean
}

/** Áudio é uma faixa baixa; foto e vídeo ocupam a largura toda. */
export const defaultAspectRatio = (media: MediaViewMedia) => {
  if (media.kind === 'audio') return undefined
  if (media.width && media.height) return media.width / media.height
  return 16 / 9
}

export const formatDuration = (sec?: number | null) => {
  if (!sec || sec < 0) return null
  const total = Math.round(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return h > 0
    ? `${h}:${mm}:${String(s).padStart(2, '0')}`
    : `${mm}:${String(s).padStart(2, '0')}`
}

export const MediaFrame = ({
  children,
  aspectRatio,
  rounded = '$6',
  ...rest
}: YStackProps & { children: ReactNode; aspectRatio?: number }) => (
  <YStack
    overflow="hidden"
    rounded={rounded}
    bg="$color2"
    borderWidth={1}
    borderColor="$borderColor"
    width="100%"
    {...(aspectRatio ? { aspectRatio } : null)}
    {...rest}
  >
    {children}
  </YStack>
)

export const MediaLoading = () => (
  <YStack flex={1} items="center" justify="center" py="$6">
    <Spinner size="small" color="$accent9" />
  </YStack>
)

/**
 * Estado de erro. O caso que importa é `needs-plan`: `canAccessMedia` (o gate do Zero)
 * ignora `requiredPlanId` de propósito, então o assinante do plano errado recebe o
 * metadado da mídia e só descobre que não pode tocá-la aqui, quando a rota de playback
 * recusa. É a única mensagem de paywall que o `MediaView` chega a mostrar — post
 * trancado nem sincroniza.
 */
export const MediaMessage = ({ code, message }: { code?: string; message?: string }) => {
  const text =
    code === 'needs-plan'
      ? 'Este conteúdo faz parte de outro plano.'
      : code === 'needs-subscription'
        ? 'Assine para ver este conteúdo.'
        : code === 'not-ready'
          ? 'Ainda subindo…'
          : code === 'r2-not-configured'
            ? 'Armazenamento de mídia não configurado.'
            : message || 'Mídia indisponível.'

  return (
    <YStack flex={1} items="center" justify="center" gap="$1" px="$4" py="$6">
      <SizableText size="$2" color="$color10" text="center">
        {text}
      </SizableText>
    </YStack>
  )
}

/** Selo de duração, canto inferior direito — vídeo e áudio. */
export const DurationBadge = ({ durationSec }: { durationSec?: number | null }) => {
  const label = formatDuration(durationSec)
  if (!label) return null

  return (
    <YStack
      position="absolute"
      b="$2"
      r="$2"
      px="$2"
      py="$0.5"
      rounded="$4"
      bg="rgba(0,0,0,0.65)"
    >
      <SizableText size="$1" color="white" fontWeight="600">
        {label}
      </SizableText>
    </YStack>
  )
}
