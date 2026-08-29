// Upload de mídia, com progresso.
//
// Três passos: pedir a URL assinada, mandar os bytes direto ao R2, confirmar. O arquivo
// nunca passa pelo servidor do app — o PUT vai do dispositivo para o bucket.
//
// Usa `XMLHttpRequest` e não `fetch` porque só o XHR expõe `upload.onprogress`, e barra
// de progresso é o mínimo aceitável num vídeo de 1 GB. XHR existe nas duas plataformas.

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  formatBytes,
  isWithinSizeLimit,
  kindForMime,
  MAX_UPLOAD_BYTES,
  normalizeMime,
} from '~/constants/media'
import { newId } from '~/helpers/id'

import { mediaApi, MediaApiError } from './mediaApi'

import type { MediaKind } from '~/data/models/media'

type SignedUpload = {
  url: string
  method: 'PUT'
  headers: Record<string, string>
  expiresAt: number
}

type UploadUrlResponse = {
  mediaId: string
  kind: MediaKind
  mime: string
  storageKey: string
  posterKey: string | null
  upload: SignedUpload
  posterUpload?: SignedUpload
}

export type UploadInput = {
  /** os bytes. Na web vem do `<input type="file">`; no nativo, de `fetch(uri).blob()`. */
  blob: Blob
  /** cai para `blob.type` quando ausente */
  mime?: string
  /** capa de vídeo/áudio (JPEG). Opcional. */
  poster?: Blob
  durationSec?: number
  width?: number
  height?: number
  /** id da mídia. Passe o seu quando a tela precisar dele antes do upload terminar. */
  id?: string
}

export type UploadPhase =
  | 'idle'
  | 'signing'
  | 'uploading'
  | 'finishing'
  | 'done'
  | 'error'

export type UploadState = {
  phase: UploadPhase
  /** 0..1 */
  progress: number
  mediaId: string | null
  error: MediaApiError | null
}

const IDLE: UploadState = { phase: 'idle', progress: 0, mediaId: null, error: null }

// o PUT do arquivo domina o tempo; poster e confirmação ficam com a fatia final
const FILE_SHARE = 0.9
const POSTER_SHARE = 0.05

/** PUT cru no R2. Sem cabeçalho de sessão: a autorização está na assinatura da URL. */
function putWithProgress({
  upload,
  blob,
  onProgress,
  registerXhr,
}: {
  upload: SignedUpload
  blob: Blob
  onProgress?: (ratio: number) => void
  registerXhr: (xhr: XMLHttpRequest | null) => void
}) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    registerXhr(xhr)
    xhr.open(upload.method, upload.url, true)

    for (const [name, value] of Object.entries(upload.headers)) {
      xhr.setRequestHeader(name, value)
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total)
      }
    }

    xhr.onload = () => {
      registerXhr(null)
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      // 403 aqui quase sempre é CORS ou Content-Type diferente do assinado
      reject(
        new MediaApiError(
          xhr.status,
          'r2-put-failed',
          `O bucket recusou o upload (${xhr.status}). Confira a política de CORS do R2.`,
        ),
      )
    }

    xhr.onerror = () => {
      registerXhr(null)
      reject(
        new MediaApiError(0, 'r2-network', 'Falha de rede ao enviar o arquivo ao R2.'),
      )
    }

    xhr.onabort = () => {
      registerXhr(null)
      reject(new MediaApiError(0, 'aborted', 'Upload cancelado.'))
    }

    xhr.send(blob)
  })
}

export function useMediaUpload() {
  const [state, setState] = useState<UploadState>(IDLE)

  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      xhrRef.current?.abort()
    }
  }, [])

  const patch = useCallback((next: Partial<UploadState>) => {
    if (mountedRef.current) setState((prev) => ({ ...prev, ...next }))
  }, [])

  const reset = useCallback(() => setState(IDLE), [])

  const cancel = useCallback(() => {
    xhrRef.current?.abort()
    xhrRef.current = null
  }, [])

  /**
   * Sobe um arquivo e devolve o id da mídia (já com `status: 'ready'`), ou `null` em
   * caso de erro — o motivo fica em `state.error`.
   */
  const upload = useCallback(
    async (input: UploadInput): Promise<string | null> => {
      const mime = normalizeMime(input.mime || input.blob.type || '')
      const kind = kindForMime(mime)

      // valida antes de gastar round-trip; o servidor valida de novo de qualquer jeito
      if (!kind) {
        const error = new MediaApiError(
          400,
          'unsupported-mime',
          `Tipo de arquivo não suportado: ${mime || 'desconhecido'}.`,
        )
        setState({ ...IDLE, phase: 'error', error })
        return null
      }

      if (!isWithinSizeLimit(kind, input.blob.size)) {
        const error = new MediaApiError(
          413,
          'too-large',
          `Arquivo de ${kind} passa do limite de ${formatBytes(MAX_UPLOAD_BYTES[kind])}.`,
        )
        setState({ ...IDLE, phase: 'error', error })
        return null
      }

      const mediaId = input.id || newId()
      setState({ phase: 'signing', progress: 0, mediaId, error: null })

      try {
        const signed = await mediaApi<UploadUrlResponse>('/media/upload-url', {
          method: 'POST',
          body: JSON.stringify({
            id: mediaId,
            kind,
            mime,
            sizeBytes: input.blob.size,
            durationSec: input.durationSec,
            width: input.width,
            height: input.height,
            poster: Boolean(input.poster),
          }),
        })

        patch({ phase: 'uploading' })

        await putWithProgress({
          upload: signed.upload,
          blob: input.blob,
          onProgress: (ratio) => patch({ progress: ratio * FILE_SHARE }),
          registerXhr: (xhr) => {
            xhrRef.current = xhr
          },
        })

        if (input.poster && signed.posterUpload) {
          await putWithProgress({
            upload: signed.posterUpload,
            blob: input.poster,
            onProgress: (ratio) =>
              patch({ progress: FILE_SHARE + ratio * POSTER_SHARE }),
            registerXhr: (xhr) => {
              xhrRef.current = xhr
            },
          })
        }

        patch({ phase: 'finishing', progress: FILE_SHARE + POSTER_SHARE })

        await mediaApi('/media/complete', {
          method: 'POST',
          body: JSON.stringify({
            id: mediaId,
            durationSec: input.durationSec,
            width: input.width,
            height: input.height,
          }),
        })

        patch({ phase: 'done', progress: 1 })
        return mediaId
      } catch (err) {
        const error =
          err instanceof MediaApiError
            ? err
            : new MediaApiError(0, 'unknown', 'Falha inesperada no upload.')
        if (mountedRef.current) {
          setState({ phase: 'error', progress: 0, mediaId, error })
        }
        return null
      }
    },
    [patch],
  )

  return {
    ...state,
    isUploading:
      state.phase === 'signing' ||
      state.phase === 'uploading' ||
      state.phase === 'finishing',
    upload,
    cancel,
    reset,
  }
}
