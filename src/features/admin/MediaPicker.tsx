import { useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { formatBytes, MAX_UPLOAD_BYTES } from '~/constants/media'
import { MediaView } from '~/features/media/MediaView'
import { useMediaUpload } from '~/features/media/useMediaUpload'
import { newId } from '~/helpers/id'
import { Button } from '~/interface/buttons/Button'
import { Pressable } from '~/interface/buttons/Pressable'
import { zero } from '~/zero/client'

import { pickFile } from './pickFile'

import type { PostKind } from '~/data/types'
import type { PickKind } from './pickFile'

type AttachedMedia = {
  id: string
  position?: number
  media?: { id: string; kind: any; durationSec?: number | null } | null
}

/**
 * Anexa mídia ao post: escolher arquivo → upload direto no R2 → `postMedia`.
 *
 * O upload em si é da Fase 5 (`useMediaUpload`); aqui só entram o seletor de arquivo,
 * a barra de progresso e o vínculo com o post.
 */
export const MediaPicker = ({
  postId,
  kind,
  attached,
}: {
  postId: string
  kind: PostKind
  attached: AttachedMedia[]
}) => {
  const { upload, progress, phase, isUploading, error, reset } = useMediaUpload()
  const [localError, setLocalError] = useState<string | null>(null)

  // post de texto ainda aceita anexo; o seletor só se estreita quando o tipo diz algo
  const pickKind: PickKind = kind === 'text' ? 'any' : kind

  const onPick = async () => {
    setLocalError(null)
    reset()

    const file = await pickFile(pickKind)
    if (!file) return

    const mediaId = await upload({ blob: file, mime: file.type })
    if (!mediaId) return

    // o vínculo só existe depois que a mídia está `ready` — o hook só devolve id nesse caso
    await zero.mutate.postMedia.insert({
      id: newId(),
      postId,
      mediaId,
      position: attached.length,
    })
  }

  const detach = async (linkId: string) => {
    // apaga o vínculo, não a mídia: ela pode estar em outro post
    await zero.mutate.postMedia.delete({ id: linkId })
  }

  const message = localError || error?.message

  return (
    <YStack gap="$2">
      <XStack items="center" justify="space-between" gap="$3">
        <YStack gap="$0.5">
          <SizableText size="$2" fontWeight="600" color="$color11">
            Mídia
          </SizableText>
          <SizableText size="$1" color="$color10">
            foto até {formatBytes(MAX_UPLOAD_BYTES.photo)} · áudio até{' '}
            {formatBytes(MAX_UPLOAD_BYTES.audio)} · vídeo até{' '}
            {formatBytes(MAX_UPLOAD_BYTES.video)}
          </SizableText>
        </YStack>

        <Button
          size="$2"
          variant="outlined"
          onPress={onPick}
          disabled={isUploading}
          data-testid="attach-media"
        >
          {isUploading ? 'Enviando…' : 'Anexar arquivo'}
        </Button>
      </XStack>

      {isUploading ? (
        <YStack gap="$1">
          <YStack height={4} rounded={100} bg="$color4" overflow="hidden">
            <YStack height={4} width={`${Math.round(progress * 100)}%`} bg="$accent9" />
          </YStack>
          <SizableText size="$1" color="$color10">
            {phase === 'signing'
              ? 'Autorizando…'
              : phase === 'finishing'
                ? 'Finalizando…'
                : `${Math.round(progress * 100)}%`}
          </SizableText>
        </YStack>
      ) : null}

      {message ? (
        <SizableText size="$2" color="$red10">
          {message}
        </SizableText>
      ) : null}

      {attached.length > 0 ? (
        <YStack gap="$2" pt="$1">
          {attached.map((entry) =>
            entry.media ? (
              <YStack key={entry.id} gap="$1">
                <MediaView media={entry.media as any} />
                <XStack justify="flex-end">
                  <Pressable onPress={() => detach(entry.id)} role="button">
                    <SizableText size="$1" fontWeight="600" color="$red10">
                      Remover
                    </SizableText>
                  </Pressable>
                </XStack>
              </YStack>
            ) : null,
          )}
        </YStack>
      ) : null}
    </YStack>
  )
}
