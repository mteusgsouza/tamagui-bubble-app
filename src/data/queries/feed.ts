import { zql } from 'on-zero'

import { canAccessPost } from '~/data/where/canAccessContent'

// As permissions (`canAccessPost`) só rodam no servidor e decidem o que **sincroniza**.
// Os `.where()` daqui são para o cache local: uma mutation otimista cria a linha no
// cliente antes do servidor responder, e sem estes filtros um post recém-apagado
// reapareceria por um instante.

/**
 * Feed do criador. Carrega tudo que a tela de detalhe também usa — autor, mídias em
 * ordem, primeiros comentários e a reação do próprio usuário — para a navegação
 * lista → detalhe resolver no cache local, sem round-trip.
 */
export const feedPosts = (props: {
  feedOwnerId: string
  userId: string
  limit?: number
}) => {
  return (
    zql.post
      .where(canAccessPost)
      .where('feedOwnerId', props.feedOwnerId)
      .where('published', true)
      .where('deleted', false)
      .orderBy('publishedAt', 'desc')
      .orderBy('id', 'desc')
      .limit(props.limit ?? 20)
      .related('feedOwner', (q) => q.one())
      .related('media', (q) =>
        q.orderBy('position', 'asc').related('media', (m) => m.one()),
      )
      .related('comments', (q) =>
        q
          .where('deleted', false)
          .orderBy('createdAt', 'desc')
          .limit(3)
          .related('user', (u) => u.one()),
      )
      // só a reação de quem está olhando: é o que o coração preenchido precisa saber
      .related('reactions', (q) => q.where('userId', props.userId))
  )
}

/** Mesma forma do `feedPosts`, um post só. Resolve instantâneo vindo da lista. */
export const postDetail = (props: { postId: string; userId: string }) => {
  return zql.post
    .where(canAccessPost)
    .where('id', props.postId)
    .where('deleted', false)
    .one()
    .related('feedOwner', (q) => q.one())
    .related('media', (q) =>
      q.orderBy('position', 'asc').related('media', (m) => m.one()),
    )
    .related('comments', (q) =>
      q
        .where('deleted', false)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .related('user', (u) => u.one())
        .related('replies', (r) =>
          r
            .where('deleted', false)
            .orderBy('createdAt', 'asc')
            .related('user', (u) => u.one()),
        ),
    )
    .related('reactions', (q) => q.where('userId', props.userId))
}

/**
 * Página seguinte do feed. O cursor é `{ publishedAt, id }` porque a ordenação é por
 * esse par — `id` sozinho não desempata datas iguais.
 */
export const feedPostsPage = (props: {
  feedOwnerId: string
  userId: string
  pageSize: number
  cursor?: { id: string; publishedAt: number } | null
}) => {
  const query = zql.post
    .where(canAccessPost)
    .where('feedOwnerId', props.feedOwnerId)
    .where('published', true)
    .where('deleted', false)
    .orderBy('publishedAt', 'desc')
    .orderBy('id', 'desc')
    .limit(props.pageSize)
    .related('feedOwner', (q) => q.one())
    .related('media', (q) =>
      q.orderBy('position', 'asc').related('media', (m) => m.one()),
    )
    .related('reactions', (q) => q.where('userId', props.userId))

  return props.cursor ? query.start(props.cursor) : query
}
