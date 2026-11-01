import { useEffect, useState } from 'react'
import { isWeb, SizableText, XStack, YStack } from 'tamagui'

import { formatBytes, MAX_PHOTOS_PER_POST, MAX_UPLOAD_BYTES } from '~/constants/media'
import { adminPosts } from '~/data/client/api'
import { useInvalidateAfterAdminWrite } from '~/data/client/mutations'
import { postRatio } from '~/features/media/focalPoint'
import { MediaView } from '~/features/media/MediaView'
import { useMediaUpload } from '~/features/media/useMediaUpload'
import { Pressable } from '~/interface/buttons/Pressable'

import { FocalPointEditor } from './FocalPointEditor'
import { pickFiles } from './pickFile'
import {
  acceptKind,
  canAddMore,
  deriveKind,
  remainingSlots,
  withMedia,
} from './postMediaRules'

import type { PostKind } from '~/data/enums'
import type { MediaViewMedia } from '~/features/media/MediaFrame'
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
  ensurePost,
}: {
  postId: string
  attached: AttachedMedia[]
  onKindChange: (kind: PostKind) => void
  /**
   * Garante que a linha do post exista antes do primeiro anexo.
   *
   * `postMedia.postId` é FK, então o post precisa existir — mas isso é problema nosso,
   * não de quem publica. O id já nasceu no cliente, então dá para criar o rascunho no
   * instante em que o arquivo é escolhido, sem pedir "salve primeiro".
   */
  ensurePost: () => Promise<boolean>
}) => {
  const { upload, error, reset } = useMediaUpload()
  const invalidate = useInvalidateAfterAdminWrite()
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  /** id da **mídia** (não do vínculo) em ajuste de recorte; `null` = ninguém */
  const [editing, setEditing] = useState<string | null>(null)
  const [focalSaving, setFocalSaving] = useState(false)

  const items = withMedia(attached)
  const kind = deriveKind(attached)
  const slots = remainingSlots(attached)

  const photos = items.map((entry) => entry.media as MediaViewMedia)
  // a proporção que o post vai usar de verdade, para a prévia do recorte não mentir
  const ratio = postRatio(photos) ?? 16 / 9
  const editingMedia = photos.find((media) => media.id === editing) ?? null

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

    // cria o rascunho agora, se ainda não existe — escolher arquivo já é intenção
    // suficiente; ninguém precisa ser mandado "salvar antes"
    if (!(await ensurePost())) {
      setLocalError(
        'Não consegui criar o rascunho do post. Tente salvar e anexar de novo.',
      )
      return
    }

    const accepted = files.slice(0, slots)
    if (files.length > slots) {
      setLocalError(
        `Você escolheu ${files.length} arquivos e cabem ${slots}. Subi os ${slots} primeiros.`,
      )
    }

    // sequencial de propósito: o hook tem um XHR só, e subir 9 em paralelo estouraria
    // a fila de mutations do Zero na hora de criar os vínculos
    setQueue({ done: 0, total: accepted.length })
    for (const [index, file] of accepted.entries()) {
      // 🔴 `width`/`height` vêm medidos do seletor (`pickFile.ts`). Sem eles,
      // `media.width` nascia `NULL`, `defaultAspectRatio` caía em 16/9 e **toda foto em
      // pé aparecia cortada** — era esse o bug do enquadramento, e ele começava aqui.
      const mediaId = await upload({
        blob: file.blob,
        mime: file.mime,
        width: file.width,
        height: file.height,
        durationSec: file.durationSec,
      })
      if (!mediaId) break

      // a `position` sai do servidor (`max + 1`), então `position++` local some junto
      // com a corrida que ele tinha entre dois anexos rápidos
      await adminPosts({ action: 'attachMedia', id: postId, mediaId })
      setQueue({ done: index + 1, total: accepted.length })
    }

    setQueue(null)
  }

  const detach = async (linkId: string) => {
    // apaga o vínculo, não a mídia: ela pode estar em outro post
    await adminPosts({ action: 'detachMedia', postMediaId: linkId })
    invalidate()
  }

  const saveFocal = async (point: { x: number; y: number }) => {
    if (!editing) return
    setFocalSaving(true)
    setLocalError(null)
    try {
      await adminPosts({
        action: 'setMediaFocal',
        mediaId: editing,
        focalX: point.x,
        focalY: point.y,
      })
      invalidate()
      setEditing(null)
    } catch {
      setLocalError('Não deu para salvar o recorte.')
    } finally {
      setFocalSaving(false)
    }
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

      {editingMedia ? (
        <FocalPointEditor
          media={editingMedia}
          postRatio={ratio}
          saving={focalSaving}
          onCancel={() => setEditing(null)}
          onSave={saveFocal}
        />
      ) : items.length === 0 ? (
        <EmptyDropArea onPress={onAdd} busy={busy} queue={queue} />
      ) : kind === 'photo' ? (
        <XStack flexWrap="wrap" gap="$2">
          {/* duas colunas no celular, três no desktop. `$md` é `minWidth: 768` nesta
              config (Tamagui v5, mobile-first), então o valor base é o do celular */}
          {items.map((entry) => (
            <YStack
              key={entry.id}
              width="48%"
              minW={96}
              gap="$1"
              $md={{ width: '31.5%' }}
            >
              <MediaView media={entry.media as any} aspectRatio={1} rounded="$4" />
              <XStack justify="space-between" items="center" gap="$2">
                {/* 🔴 `isWeb`: o `FocalPointEditor` é DOM cru (precisa de
                    `setPointerCapture` para o arrasto não grudar). O admin é web-only
                    hoje, mas o código dele entra no bundle nativo — e o dia em que
                    alguém tirar o redirect de `admin/_layout.tsx`, um `<div>`
                    renderizado no nativo quebra a tela. Não oferecer é melhor que
                    oferecer e quebrar; habilitar no nativo é escrever
                    `FocalPointEditor.native.tsx`. */}
                {isWeb ? (
                  <TileAction
                    label="ajustar"
                    onPress={() => setEditing(entry.media!.id)}
                    testID="focal-open"
                  />
                ) : (
                  <YStack />
                )}
                <TileAction label="remover" danger onPress={() => detach(entry.id)} />
              </XStack>
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

const EmptyDropArea = ({ onPress, busy, queue }: BusyProps & { onPress: () => void }) => (
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
    width="48%"
    minW={96}
    $md={{ width: '31.5%' }}
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

/** Ação de um tile da grade. Alvo de toque com folga: no celular é o dedo. */
const TileAction = ({
  label,
  onPress,
  danger,
  testID,
}: {
  label: string
  onPress: () => void
  danger?: boolean
  testID?: string
}) => (
  <Pressable onPress={onPress} role="button" py="$1" px="$1" data-testid={testID}>
    <SizableText size="$1" fontWeight="600" color={danger ? '$red10' : '$accent11'}>
      {label}
    </SizableText>
  </Pressable>
)
