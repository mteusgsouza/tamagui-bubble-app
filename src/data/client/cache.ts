// Escrita direta no cache: o que mantém a tela instantânea sem ir à rede.
//
// 🔴 **Um post vive em dois caches** — a página do feed e o detalhe. Espalhar a
// atualização pelos dois em cada lugar que escreve garantiria que um ficasse errado,
// então tudo passa por `patchPost`.

import type { QueryClient } from '@tanstack/react-query'
import type { FeedPageDTO, PostDTO } from '~/server/content/dto'
import type { qk } from './keys'

type Keys = ReturnType<typeof qk>

/** O formato que o `useInfiniteQuery` guarda. */
type FeedPages = { pages: FeedPageDTO[]; pageParams: unknown[] }

const isFeedPages = (value: unknown): value is FeedPages =>
  typeof value === 'object' && value !== null && Array.isArray((value as FeedPages).pages)

const isPostEnvelope = (value: unknown): value is { post: PostDTO } =>
  typeof value === 'object' && value !== null && 'post' in value

/**
 * Aplica `patch` ao post onde quer que ele apareça no cache do usuário.
 *
 * Devolve o estado anterior das entradas tocadas, para o `onError` restaurar.
 */
export function patchPost(
  client: QueryClient,
  keys: Keys,
  postId: string,
  patch: (post: PostDTO) => PostDTO,
): [readonly unknown[], unknown][] {
  const snapshot = client.getQueriesData({ queryKey: keys.root })

  client.setQueriesData({ queryKey: keys.root }, (current: unknown) => {
    if (isFeedPages(current)) {
      let touched = false
      const pages = current.pages.map((page) => {
        if (!page.posts.some((item) => item.id === postId)) return page
        touched = true
        return {
          ...page,
          posts: page.posts.map((item) => (item.id === postId ? patch(item) : item)),
        }
      })
      return touched ? { ...current, pages } : current
    }

    if (isPostEnvelope(current) && current.post.id === postId) {
      return { ...current, post: patch(current.post) }
    }

    return current
  })

  return snapshot as [readonly unknown[], unknown][]
}

/** Desfaz um `patchPost` quando a escrita falha no servidor. */
export function restore(
  client: QueryClient,
  snapshot: [readonly unknown[], unknown][] | undefined,
) {
  if (!snapshot) return
  for (const [key, value] of snapshot) client.setQueryData(key, value)
}

/**
 * O post que o feed já tem em cache, se tiver.
 *
 * É o que faz abrir um post ser **instantâneo**: a tela de detalhe nasce com o card que
 * a lista mostrava e busca os comentários por baixo, em vez de piscar um spinner sobre
 * dado que já estava na memória.
 */
export function postFromFeedCache(
  client: QueryClient,
  keys: Keys,
  postId: string,
): { post: PostDTO; updatedAt: number } | undefined {
  for (const [, value] of client.getQueriesData({ queryKey: keys.feed() })) {
    if (!isFeedPages(value)) continue
    for (const page of value.pages) {
      const found = page.posts.find((item) => item.id === postId)
      if (found) {
        const state = client.getQueryState(keys.feed())
        return { post: found, updatedAt: state?.dataUpdatedAt ?? 0 }
      }
    }
  }
  return undefined
}
