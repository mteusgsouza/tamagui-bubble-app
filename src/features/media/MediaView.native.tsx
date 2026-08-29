// `<MediaView>` — iOS/Android. A versão web é `MediaView.tsx`.
//
// Aqui **tudo** passa por `useSignedPlayback`, inclusive foto: no nativo a sessão é um
// Bearer, e nem `<Image>` nem player aceitam cabeçalho de autorização. Então o app
// busca a URL já assinada e entrega ao componente uma URL que dispensa autenticação.
// Na web é diferente — lá o cookie viaja sozinho e a foto vai direto na rota.

import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useVideoPlayer, VideoView } from 'expo-video'
import { memo, useEffect } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { Image } from '~/interface/image/Image'
import { PauseIcon } from '~/interface/icons/PauseIcon'
import { PlayIcon } from '~/interface/icons/PlayIcon'
import { Pressable } from '~/interface/buttons/Pressable'

import {
  DurationBadge,
  defaultAspectRatio,
  formatDuration,
  MediaFrame,
  MediaLoading,
  MediaMessage,
} from './MediaFrame'
import { useSignedPlayback } from './playback'

import type { MediaViewProps } from './MediaFrame'

export const MediaView = memo(
  ({ media, aspectRatio, rounded, autoPlay, alt, enabled = true }: MediaViewProps) => {
    const ratio = aspectRatio ?? defaultAspectRatio(media)
    const { url, loading, error } = useSignedPlayback(media.id, 'original', enabled)

    if (error) {
      return (
        <MediaFrame aspectRatio={ratio} rounded={rounded}>
          <MediaMessage code={error.code} message={error.message} />
        </MediaFrame>
      )
    }

    if (!url) {
      return (
        <MediaFrame aspectRatio={ratio} rounded={rounded}>
          {/* `enabled: false` é espera, não falha: moldura vazia, sem erro */}
          {loading || !enabled ? <MediaLoading /> : <MediaMessage />}
        </MediaFrame>
      )
    }

    if (media.kind === 'photo') {
      return (
        <MediaFrame aspectRatio={ratio} rounded={rounded}>
          <Image
            src={url}
            alt={alt || ''}
            width="100%"
            height="100%"
            objectFit="cover"
          />
        </MediaFrame>
      )
    }

    if (media.kind === 'audio') {
      return (
        <MediaFrame rounded={rounded} p="$3">
          <AudioPlayer url={url} durationSec={media.durationSec} autoPlay={autoPlay} />
        </MediaFrame>
      )
    }

    return (
      <MediaFrame aspectRatio={ratio} rounded={rounded} bg="black">
        <VideoPlayer url={url} autoPlay={autoPlay} />
        <DurationBadge durationSec={media.durationSec} />
      </MediaFrame>
    )
  },
)

const VideoPlayer = ({ url, autoPlay }: { url: string; autoPlay?: boolean }) => {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false
    if (autoPlay) instance.play()
  })

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%' }}
      contentFit="contain"
      nativeControls
      // nesta versão do expo-video o fullscreen virou objeto (`allowsFullscreen` saiu).
      // PiP fica de fora: exige o config plugin do expo-video ligando
      // `supportsPictureInPicture`, que acrescenta o background mode `audio` no
      // Info.plist — hoje `app.config.ts` só tem `fetch` e `remote-notification`.
      fullscreenOptions={{ enable: true }}
    />
  )
}

/**
 * Player de áudio mínimo: play/pause, tempo e barra de progresso. O nativo não tem um
 * `<audio controls>` pronto como a web, então os controles são nossos.
 */
const AudioPlayer = ({
  url,
  durationSec,
  autoPlay,
}: {
  url: string
  durationSec?: number | null
  autoPlay?: boolean
}) => {
  const player = useAudioPlayer(url)
  const status = useAudioPlayerStatus(player)

  useEffect(() => {
    if (autoPlay) player.play()
  }, [autoPlay, player])

  const total = status.duration || durationSec || 0
  const elapsed = status.currentTime || 0
  const ratio = total > 0 ? Math.min(elapsed / total, 1) : 0

  return (
    <XStack gap="$3" items="center" py="$2">
      <Pressable
        onPress={() => (status.playing ? player.pause() : player.play())}
        width={40}
        height={40}
        rounded={100}
        bg="$accent9"
        items="center"
        justify="center"
      >
        {status.playing ? (
          <PauseIcon size={16} color="$accent1" />
        ) : (
          <PlayIcon size={16} color="$accent1" />
        )}
      </Pressable>

      <YStack flex={1} gap="$1.5">
        <YStack height={4} rounded={100} bg="$color4" overflow="hidden">
          <YStack height={4} width={`${ratio * 100}%`} bg="$accent9" />
        </YStack>
        <SizableText size="$1" color="$color10">
          {formatDuration(elapsed) || '0:00'} / {formatDuration(total) || '0:00'}
        </SizableText>
      </YStack>
    </XStack>
  )
}
