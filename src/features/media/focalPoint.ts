// Recorte: onde a imagem é cortada, e qual proporção o post usa.
//
// Funções puras, fora do componente, para poder ter teste — mesmo motivo de
// `postMediaRules.ts`. Elas decidem o que o espectador vê de uma foto, e errar aqui
// corta a cabeça de quem está na imagem sem que nenhum teste de tipo reclame.

import { FOCAL_CENTER } from '~/constants/media'

import type { MediaViewMedia } from './MediaFrame'

/** Quem nunca ajustou fica no centro — o comportamento de sempre. */
export { FOCAL_CENTER }

/**
 * Limites da proporção de um post.
 *
 * 🔴 **Não é estética, é layout.** Sem limite, uma foto 9:16 em tela cheia de celular
 * passa de uma tela e meia de altura: o espectador rola a imagem inteira antes de
 * chegar ao botão de curtir, e nunca vê o post como um card. E no outro extremo um
 * panorama 21:9 vira uma tira de 60px.
 *
 * `4/5` é o retrato mais alto que ainda cabe numa tela; `16/9` é a deitada mais larga
 * que ainda parece foto. Foto fora disso é recortada — e é aí que o ponto focal deixa
 * de ser enfeite.
 */
export const MIN_POST_RATIO = 4 / 5
export const MAX_POST_RATIO = 16 / 9

/** A proporção de quem não tem dimensão gravada: o fallback histórico. */
export const FALLBACK_RATIO = 16 / 9

/** Prende em `0..1`. Valor fora da faixa (ou lixo) volta ao centro. */
export const clampFocal = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return FOCAL_CENTER
  return Math.min(1, Math.max(0, value))
}

export const clampRatio = (ratio: number) =>
  Math.min(MAX_POST_RATIO, Math.max(MIN_POST_RATIO, ratio))

/**
 * O ponto focal como `objectPosition` da web: `'50% 40%'`.
 *
 * A semântica de porcentagem do CSS é exatamente a que queremos — "o ponto a X% da
 * imagem encosta no ponto a X% da moldura" — então `0..1` vira `0..100%` direto, sem
 * conta de deslocamento.
 */
export const focalPosition = (
  media: Pick<MediaViewMedia, 'focalX' | 'focalY'> | null | undefined,
) => {
  const x = clampFocal(media?.focalX)
  const y = clampFocal(media?.focalY)
  return `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`
}

/** O mesmo ponto no vocabulário do `expo-image` (nativo). */
export const focalContentPosition = (
  media: Pick<MediaViewMedia, 'focalX' | 'focalY'> | null | undefined,
) => ({
  left: `${(clampFocal(media?.focalX) * 100).toFixed(2)}%`,
  top: `${(clampFocal(media?.focalY) * 100).toFixed(2)}%`,
})

/** Proporção real da mídia, sem limite. `undefined` quando não há como saber. */
export const mediaRatio = (media: MediaViewMedia | null | undefined) =>
  media?.width && media?.height ? media.width / media.height : undefined

/**
 * **Uma** proporção para o post inteiro, tirada da primeira mídia e limitada.
 *
 * Por que uma só, e não a de cada foto: o carrossel pagina lado a lado, então slides de
 * alturas diferentes fazem o card **pular a cada swipe** e empurram o resto do feed.
 * Isso não acontecia enquanto `media.width` era `NULL` em tudo (toda foto caía em 16/9
 * por acidente); passou a poder acontecer no instante em que a dimensão virou real.
 *
 * Áudio não tem proporção — é uma faixa de altura própria, e devolver número aqui
 * esticaria o player.
 */
export const postRatio = (
  items: readonly MediaViewMedia[] | null | undefined,
): number | undefined => {
  const first = items?.[0]
  if (!first || first.kind === 'audio') return undefined

  const ratio = mediaRatio(first)
  return ratio ? clampRatio(ratio) : FALLBACK_RATIO
}
