// Formas que a UI do feed consome.
//
// São tipos **estruturais**, escritos à mão, e não os tipos derivados das queries do
// Zero de propósito: os componentes assim aceitam tanto `feedPosts` quanto `postDetail`
// (que trazem campos diferentes) sem um cast em cada tela. Arrays são `readonly` porque
// é assim que o resultado do Zero chega.

import type { PostKind } from '~/data/enums'
import type { MediaViewMedia } from '~/features/media/MediaFrame'

export type FeedAuthor = {
  id?: string
  name?: string | null
  username?: string | null
  image?: string | null
}

export type FeedPostMedia = {
  id: string
  position?: number
  media?: MediaViewMedia | null
}

export type FeedComment = {
  id: string
  userId: string
  body: string
  createdAt: number
  deleted?: boolean
  parentId?: string | null
  user?: FeedAuthor | null
  replies?: readonly FeedComment[]
}

export type FeedPost = {
  id: string
  feedOwnerId: string
  kind: PostKind
  title?: string | null
  /** a isca do card bloqueado; pública, chega mesmo para quem não assina */
  teaser?: string | null
  /**
   * O texto do post — **`null` quando o usuário não tem direito**.
   *
   * É o sinal de bloqueado, e não há flag além disto: o servidor simplesmente não
   * sincroniza a linha de `postContent` de quem não pode ler. Ver `isPostLocked`.
   */
  content?: { body?: string | null } | null
  visibility: string
  /** só para o texto do paywall dizer que o post exige um plano específico */
  requiredPlanId?: string | null
  publishedAt?: number | null
  likeCount: number
  commentCount: number
  feedOwner?: FeedAuthor | null
  media?: readonly FeedPostMedia[]
  comments?: readonly FeedComment[]
  /**
   * Se **quem está olhando** curtiu.
   *
   * Era `reactions: [{id}]` — a query do Zero filtrava por `userId` e a tela contava o
   * array. O servidor agora achata isso num booleano, que é o que o `<LikeButton>` já
   * recebia como prop.
   */
  liked?: boolean
}

/**
 * "Este post está bloqueado para quem está olhando?"
 *
 * A resposta continua sendo a **ausência de `content`**: o servidor não manda o corpo de
 * quem não tem direito. O que mudou é que agora existe uma decisão explícita
 * (`postAccess`, em `src/server/access/contentAccess.ts`) em vez de uma linha que "não
 * sincronizou" — o DTO até carrega `locked` e `lockReason`. O predicado fica como está
 * porque um lugar só decide, e o teste protege esse lugar.
 *
 * ⚠️ Post de texto pode legitimamente ter `body` vazio, então a checagem é sobre o
 * **objeto `content`**, não sobre o conteúdo dele. Confundir os dois faria post sem texto
 * aparecer como bloqueado.
 */
export const isPostLocked = (post: { content?: { body?: string | null } | null }) =>
  post.content == null

/** As mídias do post, já sem os vínculos órfãos, na ordem de `position`. */
export const postMediaItems = (post: {
  media?: readonly FeedPostMedia[]
}): MediaViewMedia[] =>
  (post.media ?? [])
    .map((entry) => entry.media)
    .filter((media): media is MediaViewMedia => Boolean(media))
