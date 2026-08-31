import { useEffect, useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { formatBytes, MAX_PHOTOS_PER_POST, MAX_UPLOAD_BYTES } from '~/constants/media'
import { MediaView } from '~/features/media/MediaView'
import { useMediaUpload } from '~/features/media/useMediaUpload'
import { newId } from '~/helpers/id'
import { Pressable } from '~/interface/buttons/Pressable'
import { zero } from '~/zero/client'

import { pickFiles } from './pickFile'
import { acceptKind, canAddMore, deriveKind, remainingSlots, withMedia } from './postMediaRules'

import type { PostKind } from '~/data/types'
import type { AttachedMedia } from './postMediaRules'

/**
 * O campo principal do composer: a mídia.
 *
 * Quem publica **não escolhe o tipo do post** — solta o arquivo e o tipo sai daí
 * (`deriveKind`). Foto abre em grade e aceita até 9 de uma vez; vídeo e áudio ocupam o
 * post sozinhos.
 */
export const PostMediaField = ({
  postId,
  attached,
  onKindChange,
}: {
  postId: string
  attached: AttachedMedia[]
  onKindChange: (kind: PostKind) => void
}) => {
  const { upload, error, reset } = useMediaUpload()
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const items = withMedia(attached)
  const kind = deriveKind(attached)
  const slots = remainingSlots(attached)

  // o pai grava `post.kind` assim que a mídia muda — não dá para esperar o "Salvar",
  // senão o card do feed mostra o rótulo errado nesse meio-tempo
  useEffect(() => {
    onKindChange(kind)
  }, [kind, onKindChange])

  const onAdd = async () => {
    setLocalError(null)
    reset()

    const files = await pickFiles(acceptKind(attached), slots > 1)
    if (files.length === 0) return

    const accepted = files.slice(0, slots)
    if (files.length > slots) {
      setLocalError(
        `Você escolheu ${files.length} arquivos e cabem ${slots}. Subi os ${slots} primeiros.`,
      )
    }

    // sequencial de propósito: o hook tem um XHR só, e subir 9 em paralelo estouraria
    // a fila de mutations do Zero na hora de criar os vínculos
    setQueue({ done: 0, total: accepted.length })
    let position = items.length

    for (const [index, file] of accepted.entries()) {
      const mediaId = await upload({ blob: file, mime: file.type })
      if (!mediaId) break

      await zero.mutate.postMedia.insert({
        id: newId(),
        postId,
        mediaId,
        position: position++,
      })
      setQueue({ done: index + 1, total: accepted.length })
    }

    setQueue(null)
  }

  const detach = async (linkId: string) => {
    // apaga o vínculo, não a mídia: ela pode estar em outro post
    await zero.mutate.postMedia.delete({ id: linkId })
  }

  const busy = queue !== null
  const message = localError || error?.message

  return (
    <YStack gap="$2">
      <XStack items="baseline" justify="space-between" gap="$2">
        <SizableText size="$3" fontWeight="700">
          Mídia
        </SizableText>
        {kind === 'photo' && items.length > 0 ? (
          <SizableText size="$1" color="$color10">
            {items.length} de {MAX_PHOTOS_PER_POST}
          </SizableText>
        ) : null}
      </XStack>

      {items.length === 0 ? (
        <EmptyDropArea onPress={onAdd} busy={busy} queue={queue} />
      ) : kind === 'photo' ? (
        <XStack flexWrap="wrap" gap="$2">
          {items.map((entry) => (
            <YStack key={entry.id} width="31.5%" minW={96} gap="$1">
              <MediaView media={entry.media as any} aspectRatio={1} rounded="$4" />
              <RemoveLink onPress={() => detach(entry.id)} />
            </YStack>
          ))}

          {canAddMore(attached) ? (
            <AddTile onPress={onAdd} busy={busy} queue={queue} />
          ) : null}
        </XStack>
      ) : (
        <YStack gap="$1">
          <MediaView media={items[0]!.media as any} />
          <RemoveLink onPress={() => detach(items[0]!.id)} />
        </YStack>
      )}

      {message ? (
        <SizableText size="$2" color="$red10">
          {message}
        </SizableText>
      ) : null}

      <SizableText size="$1" color="$color9">
        foto até {formatBytes(MAX_UPLOAD_BYTES.photo)} (até {MAX_PHOTOS_PER_POST} por
        post) · áudio até {formatBytes(MAX_UPLOAD_BYTES.audio)} · vídeo até{' '}
        {formatBytes(MAX_UPLOAD_BYTES.video)}
      </SizableText>
    </YStack>
  )
}

type BusyProps = { busy: boolean; queue: { done: number; total: number } | null }

const busyLabel = (queue: BusyProps['queue']) =>
  queue ? `Enviando ${Math.min(queue.done + 1, queue.total)} de ${queue.total}…` : ''

const EmptyDropArea = ({
  onPress,
  busy,
  queue,
}: BusyProps & { onPress: () => void }) => (
  <Pressable
    onPress={busy ? undefined : onPress}
    role="button"
    data-testid="add-media"
    height={200}
    rounded="$6"
    borderWidth={1.5}
    borderStyle="dashed"
    borderColor="$borderColor"
    bg="$color1"
    items="center"
    justify="center"
    gap="$1.5"
    hoverStyle={{ borderColor: '$accent7', bg: '$color2' }}
  >
    <SizableText size="$5" fontWeight="700" color="$accent11">
      {busy ? busyLabel(queue) : '+ Adicionar mídia'}
    </SizableText>
    {!busy ? (
      <SizableText size="$2" color="$color10">
        foto, vídeo ou áudio — o tipo do post sai do arquivo
      </SizableText>
    ) : null}
  </Pressable>
)

const AddTile = ({ onPress, busy, queue }: BusyProps & { onPress: () => void }) => (
  <Pressable
    onPress={busy ? undefined : onPress}
    role="button"
    data-testid="add-media"
    width="31.5%"
    minW={96}
    aspectRatio={1}
    rounded="$4"
    borderWidth={1.5}
    borderStyle="dashed"
    borderColor="$borderColor"
    items="center"
    justify="center"
    hoverStyle={{ borderColor: '$accent7', bg: '$color2' }}
  >
    <SizableText size="$2" fontWeight="700" color="$accent11" text="center">
      {busy ? busyLabel(queue) : '+ foto'}
    </SizableText>
  </Pressable>
)

const RemoveLink = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} role="button" self="flex-end">
    <SizableText size="$1" fontWeight="600" color="$red10">
      remover
    </SizableText>
  </Pressable>
)
