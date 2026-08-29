// Formas que a UI do feed consome.
//
// São tipos **estruturais**, escritos à mão, e não os tipos derivados das queries do
// Zero de propósito: os componentes assim aceitam tanto `feedPosts` quanto `postDetail`
// (que trazem campos diferentes) sem um cast em cada tela. Arrays são `readonly` porque
// é assim que o resultado do Zero chega.

import type { PostKind } from '~/data/types'
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
  body?: string | null
  visibility: string
  publishedAt?: number | null
  likeCount: number
  commentCount: number
  feedOwner?: FeedAuthor | null
  media?: readonly FeedPostMedia[]
  comments?: readonly FeedComment[]
  /** só a reação do próprio usuário — array vazio significa "não curti" */
  reactions?: readonly { id: string }[]
}

/** As mídias do post, já sem os vínculos órfãos, na ordem de `position`. */
export const postMediaItems = (post: {
  media?: readonly FeedPostMedia[]
}): MediaViewMedia[] =>
  (post.media ?? [])
    .map((entry) => entry.media)
    .filter((media): media is MediaViewMedia => Boolean(media))
