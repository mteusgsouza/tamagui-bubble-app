// O rascunho do composer, na forma que o feed consome.
//
// Existe para a prévia renderizar **o `PostCard` de verdade** em vez de uma imitação:
// card imitado diverge do original na terceira mudança, e aí a prévia passa a mentir —
// que é o oposto do que ela existe para fazer.
//
// Função pura, fora do componente, para ter teste — mesmo motivo de `postMediaRules.ts`.

import { deriveKind, withMedia } from './postMediaRules'

import type { MediaKind, Visibility } from '~/data/enums'
import type { FeedAuthor, FeedPost, FeedPostMedia } from '~/features/feed/types'
import type { AttachedMedia } from './postMediaRules'

/** O que o formulário mantém em memória. Espelha o `draft` do composer. */
export type PostDraft = {
  title: string
  body: string
  teaser: string
  visibility: Visibility
  requiredPlanId: string | null
}

export type PreviewAs = 'subscriber' | 'visitor'

export const PREVIEW_OPTIONS: { id: PreviewAs; label: string }[] = [
  { id: 'subscriber', label: 'Quem assina' },
  { id: 'visitor', label: 'Quem não assina' },
]

/**
 * Monta o `FeedPost` do rascunho.
 *
 * 🔴 **`visitor` reproduz o servidor, não "esconde coisa na tela".** Post bloqueado sai
 * de `src/server/content/posts.ts` com `content: null` e `media: []` — a ausência de
 * `content` *é* o sinal de bloqueado (`isPostLocked`), e a mídia não vem porque mídia é
 * produto. Montando igual aqui, o card bloqueado da prévia é o mesmo que o visitante
 * recebe, com o `teaser` no lugar do texto.
 *
 * E post **aberto não tem estado bloqueado**: o gate do servidor só olha
 * `visibility = 'subscribers'`. Então pedir `visitor` num post público devolve o post
 * inteiro, que é a verdade — a tela usa isso para não oferecer um alternador que não
 * muda nada.
 */
export function draftToFeedPost(
  draft: PostDraft,
  attached: readonly AttachedMedia[],
  author: FeedAuthor | null,
  options: { as: PreviewAs; id?: string; publishedAt?: number },
): FeedPost {
  const locked = options.as === 'visitor' && draft.visibility === 'subscribers'

  const media: FeedPostMedia[] = locked
    ? []
    : withMedia(attached).map((entry) => ({
        id: entry.id,
        position: entry.position,
        media: {
          id: entry.media!.id,
          // `AttachedMedia` tipa `kind` como `PostKind` (que inclui `text`) porque é
          // dele que `deriveKind` sai; aqui só chegam vínculos com mídia, e mídia é
          // sempre foto, vídeo ou áudio
          kind: entry.media!.kind as MediaKind,
          durationSec: entry.media!.durationSec,
          width: entry.media!.width,
          height: entry.media!.height,
          focalX: entry.media!.focalX,
          focalY: entry.media!.focalY,
        },
      }))

  return {
    id: options.id ?? 'preview',
    feedOwnerId: author?.id ?? '',
    kind: deriveKind(attached),
    // o composer guarda string; o feed espera `null` no vazio, senão o card desenha um
    // título em branco ocupando linha
    title: draft.title.trim() || null,
    teaser: draft.teaser.trim() || null,
    content: locked ? null : { body: draft.body },
    visibility: draft.visibility,
    requiredPlanId: draft.visibility === 'subscribers' ? draft.requiredPlanId : null,
    // rascunho não tem data, e `timeAgo(null)` devolve string vazia — o card ficaria com
    // um " · assinantes" solto no lugar da data. "agora" é o que vai acontecer mesmo.
    publishedAt: options.publishedAt ?? Date.now(),
    likeCount: 0,
    commentCount: 0,
    feedOwner: author,
    media,
    liked: false,
  }
}
