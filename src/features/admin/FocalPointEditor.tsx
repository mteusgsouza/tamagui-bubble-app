// Onde a foto é cortada.
//
// 🔴 **Isto não corta bytes.** Nenhuma imagem é reprocessada e nada sobe para o R2: o
// que se escolhe aqui é um ponto em `0..1` gravado em `media.focalX/focalY`, e quem
// aplica é o `objectPosition` do navegador (`MediaView.tsx`) ou o `contentPosition` do
// `expo-image` (nativo). Por isso é instantâneo e reversível.
//
// Por que existe: a moldura do feed quase nunca tem a proporção da imagem, então
// `objectFit: cover` sempre sobra corte. Até aqui o corte era pelo centro, e foto em pé
// perdia o rosto de quem está nela.
//
// ⚠️ **Elemento de DOM cru, de propósito.** O admin é web-only (`admin/_layout.tsx`), e
// arrastar precisa dos eventos de ponteiro com `setPointerCapture` — sem ele, soltar o
// dedo fora da imagem deixa o arrasto preso. `MediaView.tsx` abre o mesmo precedente
// com `<img>` e `<video>`. Cor da marca continua token; o alvo é branco e preto porque
// é cromo de ferramenta, não marca (mesma licença do `DurationBadge`).

import { useState } from 'react'
import { SizableText, XStack, YStack } from 'tamagui'

import { clampFocal, FOCAL_CENTER, mediaRatio } from '~/features/media/focalPoint'
import { mediaPlaybackUrl } from '~/features/media/playback'
import { Button } from '~/interface/buttons/Button'

import type { MediaViewMedia } from '~/features/media/MediaFrame'

type Point = { x: number; y: number }

/** Proporção da imagem quando ninguém mediu — o mesmo fallback do resto do app. */
const FALLBACK_IMAGE_RATIO = 16 / 9

export const FocalPointEditor = ({
  media,
  postRatio,
  saving,
  onCancel,
  onSave,
}: {
  media: MediaViewMedia
  /** a proporção que o post vai usar — é o recorte que importa provar */
  postRatio: number
  saving: boolean
  onCancel: () => void
  onSave: (point: Point) => void
}) => {
  const [point, setPoint] = useState<Point>({
    x: clampFocal(media.focalX),
    y: clampFocal(media.focalY),
  })
  const [dragging, setDragging] = useState(false)
  /**
   * Proporção lida da imagem carregada, para a mídia antiga que subiu **sem**
   * `width`/`height` (toda foto anterior a este trabalho). Sem isso a caixa teria 16/9
   * e o clique cairia deslocado, porque a imagem desenhada seria menor que a caixa.
   */
  const [measured, setMeasured] = useState<number | null>(null)

  const ratio = mediaRatio(media) ?? measured ?? FALLBACK_IMAGE_RATIO
  const url = mediaPlaybackUrl(media.id)

  /**
   * Coordenada normalizada a partir do retângulo do elemento.
   *
   * Funciona porque a caixa tem **exatamente** a proporção da imagem: aí o `contain`
   * desenha preenchendo a caixa e um ponto da caixa é o mesmo ponto da imagem. Com
   * proporção diferente haveria tarja, e todo clique sairia torto.
   */
  const update = (event: { clientX: number; clientY: number }, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    setPoint({
      x: clampFocal((event.clientX - rect.left) / rect.width),
      y: clampFocal((event.clientY - rect.top) / rect.height),
    })
  }

  const moved = point.x !== clampFocal(media.focalX) || point.y !== clampFocal(media.focalY)

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <SizableText size="$3" fontWeight="700">
          Onde cortar
        </SizableText>
        <SizableText size="$1" color="$color10">
          Toque no que não pode sair do quadro — um rosto, em geral. A imagem inteira
          continua guardada; isto decide só o enquadramento.
        </SizableText>
      </YStack>

      <XStack gap="$3" flexWrap="wrap" items="flex-start">
        {/* a imagem inteira, onde se escolhe o ponto */}
        <YStack flex={1} minW={220} gap="$1.5">
          <div
            role="application"
            aria-label="Escolher o ponto focal da imagem"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              setDragging(true)
              update(event, event.currentTarget)
            }}
            onPointerMove={(event) => {
              if (dragging) update(event, event.currentTarget)
            }}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: String(ratio),
              cursor: dragging ? 'grabbing' : 'crosshair',
              touchAction: 'none',
              overflow: 'hidden',
              borderRadius: 12,
            }}
          >
            <img
              src={url}
              alt=""
              draggable={false}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget
                if (!mediaRatio(media) && naturalWidth > 0 && naturalHeight > 0) {
                  setMeasured(naturalWidth / naturalHeight)
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
                objectFit: 'contain',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            />

            {/* o alvo. Dois anéis para aparecer tanto no claro quanto no escuro */}
            <div
              style={{
                position: 'absolute',
                left: `${point.x * 100}%`,
                top: `${point.y * 100}%`,
                width: 22,
                height: 22,
                marginLeft: -11,
                marginTop: -11,
                borderRadius: 999,
                border: '2px solid white',
                boxShadow: '0 0 0 2px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(0,0,0,0.35)',
                pointerEvents: 'none',
              }}
            />
          </div>

          <SizableText size="$1" color="$color9">
            {Math.round(point.x * 100)}% · {Math.round(point.y * 100)}%
          </SizableText>
        </YStack>

        {/* o resultado, com o mesmo `cover` que o feed usa — é a prova do ajuste */}
        <YStack gap="$2" width={150}>
          <CropPreview url={url} point={point} ratio={postRatio} label="No post" />
          <CropPreview url={url} point={point} ratio={1} label="Na grade" />
        </YStack>
      </XStack>

      <XStack gap="$2" flexWrap="wrap">
        <Button
          size="$3"
          variant="accent"
          disabled={saving}
          onPress={() => onSave(point)}
          data-testid="focal-save"
        >
          <SizableText size="$3" fontWeight="600" color="$accentColor">
            {saving ? 'Salvando…' : 'Usar este recorte'}
          </SizableText>
        </Button>

        <Button size="$3" variant="outlined" disabled={saving} onPress={onCancel}>
          Cancelar
        </Button>

        {/* voltar ao centro é o estado de quem nunca ajustou, então não é "limpar" */}
        {moved || point.x !== FOCAL_CENTER || point.y !== FOCAL_CENTER ? (
          <Button
            size="$3"
            variant="outlined"
            disabled={saving}
            onPress={() => setPoint({ x: FOCAL_CENTER, y: FOCAL_CENTER })}
          >
            Centralizar
          </Button>
        ) : null}
      </XStack>
    </YStack>
  )
}

/** O recorte como o espectador vai ver: mesma proporção, mesmo `cover`, mesmo ponto. */
const CropPreview = ({
  url,
  point,
  ratio,
  label,
}: {
  url: string
  point: Point
  ratio: number
  label: string
}) => (
  <YStack gap="$1">
    <YStack
      overflow="hidden"
      rounded="$4"
      bg="$color2"
      borderWidth={1}
      borderColor="$borderColor"
      width="100%"
      aspectRatio={ratio}
    >
      <img
        src={url}
        alt=""
        draggable={false}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'cover',
          objectPosition: `${point.x * 100}% ${point.y * 100}%`,
        }}
      />
    </YStack>
    <SizableText size="$1" color="$color10">
      {label}
    </SizableText>
  </YStack>
)
