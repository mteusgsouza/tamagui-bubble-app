// `<MediaView>` — web. A versão nativa é `MediaView.native.tsx`.
//
// Foto e vídeo/áudio resolvem a URL por caminhos diferentes, de propósito:
//
// - **foto**: aponta direto para `/api/media/<id>/play`. O cookie de sessão vai junto,
//   a rota responde 302 e o navegador segue. Zero round-trip de JS — num feed com 20
//   fotos, buscar JSON para cada uma seria 20 requisições à toa.
// - **vídeo/áudio**: passa por `useSignedPlayback`, que traz a URL assinada em JSON.
//   Custa uma requisição a mais e paga por si: o player recebe a URL do R2 já resolvida
//   (melhor para seek/range) e, quando a rota recusa, temos o **código** do erro em vez
//   de um `onError` mudo — é assim que a tela distingue "assine" de "plano errado".

import { memo } from 'react'
import { YStack } from 'tamagui'

import {
  DurationBadge,
  defaultAspectRatio,
  MediaFrame,
  MediaLoading,
  MediaMessage,
} from './MediaFrame'
import { mediaPlaybackUrl, useSignedPlayback } from './playback'

import type { MediaViewProps } from './MediaFrame'

const FILL: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
  objectFit: 'cover',
}

export const MediaView = memo((props: MediaViewProps) => {
  const { media, aspectRatio, rounded, alt } = props
  const ratio = aspectRatio ?? defaultAspectRatio(media)

  if (media.kind === 'photo') {
    return (
      <MediaFrame aspectRatio={ratio} rounded={rounded}>
        <img
          src={mediaPlaybackUrl(media.id)}
          alt={alt || ''}
          loading="lazy"
          style={FILL}
        />
      </MediaFrame>
    )
  }

  return <PlayableMedia {...props} aspectRatio={ratio} />
})

const PlayableMedia = ({
  media,
  aspectRatio,
  rounded,
  autoPlay,
  enabled = true,
  onProgress,
  onEnded,
  startAtSec,
}: MediaViewProps & { aspectRatio?: number }) => {
  const { url, loading, error, reload } = useSignedPlayback(media.id, 'original', enabled)

  if (error) {
    return (
      <MediaFrame aspectRatio={aspectRatio} rounded={rounded}>
        <MediaMessage code={error.code} message={error.message} />
      </MediaFrame>
    )
  }

  if (!url) {
    return (
      <MediaFrame aspectRatio={aspectRatio} rounded={rounded}>
        {/* `enabled: false` é espera, não falha: moldura vazia, sem mensagem de erro */}
        {loading || !enabled ? <MediaLoading /> : <MediaMessage />}
      </MediaFrame>
    )
  }

  // retoma a posição salva assim que os metadados chegam — antes disso `currentTime`
  // não aceita seek
  const resume = (element: HTMLMediaElement) => {
    if (startAtSec && startAtSec > 0 && Number.isFinite(element.duration)) {
      element.currentTime = Math.min(startAtSec, element.duration - 1)
    }
  }

  const report = (element: HTMLMediaElement) => {
    onProgress?.(element.currentTime, element.duration || 0)
  }

  // `onError` cobre a URL assinada que expirou entre o carregamento e um seek tardio:
  // `reload()` busca outra (com teto, para mídia quebrada não virar laço)
  if (media.kind === 'audio') {
    return (
      <MediaFrame rounded={rounded} p="$3" justify="center">
        <audio
          src={url}
          controls
          autoPlay={autoPlay}
          onError={reload}
          onLoadedMetadata={(event) => resume(event.currentTarget)}
          onTimeUpdate={(event) => report(event.currentTarget)}
          onEnded={onEnded}
          style={{ width: '100%' }}
        />
      </MediaFrame>
    )
  }

  return (
    <MediaFrame aspectRatio={aspectRatio} rounded={rounded}>
      <YStack width="100%" height="100%">
        <video
          src={url}
          controls
          playsInline
          autoPlay={autoPlay}
          preload="metadata"
          onError={reload}
          onLoadedMetadata={(event) => resume(event.currentTarget)}
          onTimeUpdate={(event) => report(event.currentTarget)}
          onEnded={onEnded}
          poster={media.posterKey ? mediaPlaybackUrl(media.id, 'poster') : undefined}
          style={{ ...FILL, objectFit: 'contain', backgroundColor: 'black' }}
        />
        <DurationBadge durationSec={media.durationSec} />
      </YStack>
    </MediaFrame>
  )
}
