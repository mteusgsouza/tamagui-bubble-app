// Regras de quantas e quais mídias cabem num post.
//
// Vivem fora do componente para poder ser testadas: são elas que decidem o `post.kind`,
// e `kind` errado faz o card do feed mentir sobre o próprio conteúdo.
//
// A regra combinada com o usuário: **um post não mistura tipos**. O primeiro arquivo
// define o post. Foto aceita até 9; vídeo e áudio aceitam 1 e fecham a porta.

import { MAX_PHOTOS_PER_POST } from '~/constants/media'

import type { PostKind } from '~/data/types'
import type { PickKind } from './pickFile'

/** O que a query do admin entrega em `post.media` — o vínculo, com a mídia dentro. */
export type AttachedMedia = {
  id: string
  position?: number
  media?: { id: string; kind: PostKind; durationSec?: number | null } | null
}

/** Só os vínculos que têm mídia de verdade, na ordem em que vieram. */
export const withMedia = (attached: readonly AttachedMedia[]) =>
  attached.filter((entry) => Boolean(entry.media))

/**
 * O tipo do post. **Deduzido, nunca escolhido** — quem publica solta o arquivo e segue.
 * Post sem mídia é `text`, que é o default correto do schema.
 */
export function deriveKind(attached: readonly AttachedMedia[]): PostKind {
  const first = withMedia(attached)[0]
  return first?.media?.kind ?? 'text'
}

/** Quantas mídias ainda cabem. Vídeo e áudio ocupam o post inteiro. */
export function remainingSlots(attached: readonly AttachedMedia[]): number {
  const items = withMedia(attached)
  if (items.length === 0) return MAX_PHOTOS_PER_POST

  const kind = deriveKind(attached)
  if (kind !== 'photo') return 0

  return Math.max(0, MAX_PHOTOS_PER_POST - items.length)
}

export const canAddMore = (attached: readonly AttachedMedia[]) =>
  remainingSlots(attached) > 0

/**
 * O que o seletor de arquivo aceita.
 *
 * Vazio: qualquer coisa — é o primeiro arquivo que decide. Com foto: só foto, senão o
 * usuário escolheria um vídeo que seria recusado depois do upload.
 */
export const acceptKind = (attached: readonly AttachedMedia[]): PickKind =>
  withMedia(attached).length === 0 ? 'any' : 'photo'
