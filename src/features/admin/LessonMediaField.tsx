import { useState } from 'react'
import { isWeb, SizableText, XStack, YStack } from 'tamagui'

import { formatBytes, MAX_UPLOAD_BYTES } from '~/constants/media'
import { adminPosts } from '~/data/client/api'
import { useInvalidateAfterAdminWrite } from '~/data/client/mutations'
import { MediaView } from '~/features/media/MediaView'
import { useMediaUpload } from '~/features/media/useMediaUpload'
import { Pressable } from '~/interface/buttons/Pressable'

import { FocalPointEditor } from './FocalPointEditor'
import { pickFile } from './pickFile'

import type { MediaViewMedia } from '~/features/media/MediaFrame'
import type { MediaDTO } from '~/server/content/dto'
import type { PickKind } from './pickFile'

/**
 * Uma mídia só — a da aula, ou a capa do curso.
 *
 * Não é o `PostMediaField`: aquele carrega grade de até 9 fotos, fila e a tabela de
 * vínculo `postMedia`. Aqui o vínculo é uma coluna (`lesson.mediaId`,
 * `course.coverMediaId`), então o fluxo é escolher → subir → `onChange(mediaId)`.
 *
 * Trocar ou tirar **não apaga a `media`**: ela pode estar em outro lugar, e apagar bytes
 * do R2 não é desta tela.
 */
export const LessonMediaField = ({
  label,
  media,
  accept,
  emptyHint,
  onChange,
  focal = false,
  testID = 'lesson-media',
}: {
  label: string
  media: MediaDTO | null
  accept: PickKind
  emptyHint: string
  /** grava o vínculo — `null` remove. Se rejeitar, o campo mostra o erro. */
  onChange: (mediaId: string | null) => Promise<void>
  /** oferece o ajuste do ponto focal (só foto, só web) */
  focal?: boolean
  testID?: string
}) => {
  const { upload, isUploading, progress, phase, error, reset } = useMediaUpload()
  const invalidate = useInvalidateAfterAdminWrite()
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState(false)

  // `MediaDTO.kind` é string no contrato; o `MediaView` quer o enum
  const viewMedia = media as MediaViewMedia | null
  const busy = isUploading || saving
  const message = localError || error?.message

  const link = async (mediaId: string | null) => {
    setSaving(true)
    try {
      await onChange(mediaId)
    } catch {
      setLocalError('O arquivo subiu, mas não deu para ligá-lo. Tente de novo.')
    } finally {
      setSaving(false)
    }
  }

  const onPick = async () => {
    setLocalError(null)
    reset()

    const file = await pickFile(accept)
    if (!file) return

    // medidas e duração vêm do seletor (`pickFile.ts`): é dali que `media.durationSec`
    // nasce, e é ele que o currículo soma
    const mediaId = await upload({
      blob: file.blob,
      mime: file.mime,
      width: file.width,
      height: file.height,
      durationSec: file.durationSec,
    })
    if (mediaId) await link(mediaId)
  }

  const saveFocal = async (point: { x: number; y: number }) => {
    if (!media) return
    setSaving(true)
    setLocalError(null)
    try {
      await adminPosts({
        action: 'setMediaFocal',
        mediaId: media.id,
        focalX: point.x,
        focalY: point.y,
      })
      invalidate()
      setAdjusting(false)
    } catch {
      setLocalError('Não deu para salvar o recorte.')
    } finally {
      setSaving(false)
    }
  }

  const status =
    phase === 'signing'
      ? 'Preparando…'
      : phase === 'finishing'
        ? 'Confirmando…'
        : isUploading
          ? `Enviando ${Math.round(progress * 100)}%`
          : saving
            ? 'Salvando…'
            : null

  const limit = accept === 'any' ? null : MAX_UPLOAD_BYTES[accept]

  return (
    <YStack gap="$2" data-testid={testID}>
      <SizableText size="$3" fontWeight="700">
        {label}
      </SizableText>

      {adjusting && viewMedia ? (
        <FocalPointEditor
          media={viewMedia}
          postRatio={16 / 9}
          saving={saving}
          onCancel={() => setAdjusting(false)}
          onSave={saveFocal}
        />
      ) : media ? (
        <YStack gap="$1.5">
          <MediaView media={viewMedia!} rounded="$4" />
          <XStack justify="space-between" items="center" gap="$3">
            <XStack gap="$3">
              <Action label="trocar" onPress={busy ? undefined : onPick} testID={`${testID}-replace`} />
              {focal && isWeb && media.kind === 'photo' ? (
                <Action label="ajustar recorte" onPress={() => setAdjusting(true)} />
              ) : null}
            </XStack>
            <Action
              label="remover"
              danger
              onPress={busy ? undefined : () => void link(null)}
              testID={`${testID}-remove`}
            />
          </XStack>
        </YStack>
      ) : (
        <Pressable
          onPress={busy ? undefined : onPick}
          role="button"
          data-testid={`${testID}-add`}
          height={160}
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
            {status ?? '+ Adicionar'}
          </SizableText>
          {!busy ? (
            <SizableText size="$2" color="$color10">
              {emptyHint}
            </SizableText>
          ) : null}
        </Pressable>
      )}

      {media && status ? (
        <SizableText size="$2" color="$color10">
          {status}
        </SizableText>
      ) : null}

      {message ? (
        <SizableText size="$2" color="$red10">
          {message}
        </SizableText>
      ) : null}

      {limit ? (
        <SizableText size="$1" color="$color9">
          até {formatBytes(limit)}
        </SizableText>
      ) : null}
    </YStack>
  )
}

const Action = ({
  label,
  onPress,
  danger,
  testID,
}: {
  label: string
  onPress?: () => void
  danger?: boolean
  testID?: string
}) => (
  <Pressable onPress={onPress} role="button" py="$1" data-testid={testID}>
    <SizableText size="$1" fontWeight="600" color={danger ? '$red10' : '$accent11'}>
      {label}
    </SizableText>
  </Pressable>
)
