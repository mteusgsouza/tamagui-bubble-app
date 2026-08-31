// Como uma tela chega aos bytes de uma mídia.
//
// Dois caminhos, porque as duas plataformas autenticam diferente:
//
// - **web**: aponte o `<img>/<video>/<audio>` para `mediaPlaybackUrl()`. O cookie de
//   sessão viaja junto e a rota responde 302 para o R2.
// - **nativo**: a sessão é um Bearer e o player não manda cabeçalho — use
//   `useSignedPlayback()`, que busca a URL já assinada e a renova antes de expirar.

import { useCallback, useEffect, useRef, useState } from 'react'

import { API_URL } from '~/constants/urls'

import { mediaApi, MediaApiError } from './mediaApi'

import type { MediaKind } from '~/data/models/media'

export type MediaVariant = 'original' | 'poster'

/** URL da rota do app (não do R2). Exige sessão; responde 302 para a URL assinada. */
export function mediaPlaybackUrl(mediaId: string, variant: MediaVariant = 'original') {
  const base = `${API_URL}/media/${encodeURIComponent(mediaId)}/play`
  return variant === 'poster' ? `${base}?variant=poster` : base
}

export type SignedPlayback = {
  mediaId: string
  kind: MediaKind
  mime: string
  variant: MediaVariant
  /** URL do R2, já assinada. Vale poucos minutos — não guarde em estado persistente. */
  url: string
  expiresAt: number
  durationSec?: number | null
  width?: number | null
  height?: number | null
}

export function fetchSignedPlayback(mediaId: string, variant: MediaVariant = 'original') {
  const query = variant === 'poster' ? 'format=json&variant=poster' : 'format=json'
  return mediaApi<SignedPlayback>(`/media/${encodeURIComponent(mediaId)}/play?${query}`)
}

// teto de renovações automáticas: sem ele, mídia quebrada e `onError` viram laço
const MAX_RELOADS = 2

export type PlaybackState = {
  url: string | null
  loading: boolean
  /** `MediaApiError.code` conta o motivo: `needs-subscription`, `needs-plan`, ... */
  error: MediaApiError | null
  /** pede uma URL nova. Ligue no `onError` do player: é assim que URL expirada volta. */
  reload: () => void
}

/**
 * Busca **uma** URL assinada para `mediaId`.
 *
 * Não renova por timer de propósito: trocar o `src` no meio de um vídeo reinicia a
 * reprodução. Quem cobre a expiração é o TTL longo de vídeo/áudio
 * (`MEDIA_STREAM_TTL_SEC`) mais o `reload()` no `onError` do player — renovar quando
 * falha, não a cada tantos minutos.
 */
export function useSignedPlayback(
  mediaId: string | null | undefined,
  variant: MediaVariant = 'original',
  enabled = true,
): PlaybackState {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<MediaApiError | null>(null)
  const [nonce, setNonce] = useState(0)

  const reloadsRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // a contagem zera quando a mídia muda: o teto é por mídia, não por componente
  useEffect(() => {
    reloadsRef.current = 0
  }, [mediaId, variant])

  const reload = useCallback(() => {
    if (reloadsRef.current >= MAX_RELOADS) return
    reloadsRef.current += 1
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!mediaId || !enabled) {
      setUrl(null)
      setError(null)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      try {
        const signed = await fetchSignedPlayback(mediaId, variant)
        if (cancelled || !mountedRef.current) return
        setUrl(signed.url)
        setError(null)
      } catch (err) {
        if (cancelled || !mountedRef.current) return
        setUrl(null)
        setError(
          err instanceof MediaApiError
            ? err
            : new MediaApiError(0, 'network', 'Falha de rede ao buscar a mídia.'),
        )
      } finally {
        if (!cancelled && mountedRef.current) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [mediaId, variant, enabled, nonce])

  return { url, loading, error, reload }
}
