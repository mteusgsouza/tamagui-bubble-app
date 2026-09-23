// Os hooks que as telas usam. Substituem o `useQuery` do Zero.
//
// 🔴 **A regra que vale mais que todas: spinner só na primeira carga com cache vazio.**
// A condição é `isPending` (ou `data === undefined`), **nunca `isFetching`** — essa é a
// linha que separa "instantâneo" de "pisca a cada volta". Revalidação acontece por
// baixo; na tela, nada se mexe.
//
// Foi o que o replica local do Zero dava de graça, e é o que se perde por descuido.

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useMemo } from 'react'

import { useAuth } from '~/features/auth/client/authClient'

import * as api from './api'
import { postFromFeedCache } from './cache'
import { qk, STALE } from './keys'

/** As chaves do usuário da sessão. Toda tela começa por aqui. */
export function useKeys() {
  const { user } = useAuth()
  const userId = user?.id || ''
  return useMemo(() => ({ userId, keys: qk(userId) }), [userId])
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20

/**
 * O feed paginado por cursor.
 *
 * `placeholderData: keepPreviousData` é o que impede a lista de piscar ao carregar mais:
 * o que já está na tela fica, e só a página nova entra.
 */
export function useFeed() {
  const { userId, keys } = useKeys()

  return useInfiniteQuery({
    queryKey: keys.feed(),
    enabled: Boolean(userId),
    staleTime: STALE.feed,
    placeholderData: keepPreviousData,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.getFeed({ limit: PAGE_SIZE, cursor: pageParam }, { signal }),
    getNextPageParam: (last) => last.nextCursor,
  })
}

/**
 * Um post, **semeado pelo que o feed já tem**.
 *
 * Sem o `initialData`, abrir um post mostraria spinner sobre dado que estava na memória.
 * Com ele, o card aparece na hora e os comentários completos chegam depois.
 * `initialDataUpdatedAt` entrega a idade real para o React Query decidir sozinho se
 * revalida — mentir aqui (omitindo) faria o dado do feed parecer recém-buscado.
 */
export function usePost(postId: string) {
  const { userId, keys } = useKeys()
  const client = useQueryClient()

  const seed = postId ? postFromFeedCache(client, keys, postId) : undefined

  return useQuery({
    queryKey: keys.post(postId),
    enabled: Boolean(userId && postId),
    staleTime: STALE.post,
    queryFn: ({ signal }) => api.getPost(postId, { signal }),
    initialData: seed ? { post: seed.post } : undefined,
    initialDataUpdatedAt: seed?.updatedAt,
  })
}

// ---------------------------------------------------------------------------
// Cursos
// ---------------------------------------------------------------------------

export function useCourses() {
  const { userId, keys } = useKeys()

  return useQuery({
    queryKey: keys.courses(),
    enabled: Boolean(userId),
    staleTime: STALE.courses,
    queryFn: ({ signal }) => api.getCourses({ signal }),
  })
}

/** Um curso pelo slug, semeado pela lista quando ela já foi carregada. */
export function useCourse(slug: string) {
  const { userId, keys } = useKeys()
  const client = useQueryClient()

  const listed = client
    .getQueryData<{ courses: import('~/server/content/dto').CourseDTO[] }>(keys.courses())
    ?.courses.find((item) => item.slug === slug)

  return useQuery({
    queryKey: keys.course(slug),
    enabled: Boolean(userId && slug),
    staleTime: STALE.courses,
    queryFn: ({ signal }) => api.getCourse(slug, { signal }),
    initialData: listed ? { course: listed } : undefined,
    initialDataUpdatedAt: listed
      ? (client.getQueryState(keys.courses())?.dataUpdatedAt ?? 0)
      : undefined,
  })
}

export function useLesson(lessonId: string) {
  const { userId, keys } = useKeys()

  return useQuery({
    queryKey: keys.lesson(lessonId),
    enabled: Boolean(userId && lessonId),
    staleTime: STALE.lesson,
    queryFn: ({ signal }) => api.getLesson(lessonId, { signal }),
  })
}

// ---------------------------------------------------------------------------
// Planos e conta
// ---------------------------------------------------------------------------

export function usePlans() {
  const { userId, keys } = useKeys()

  return useQuery({
    queryKey: keys.plans(),
    enabled: Boolean(userId),
    staleTime: STALE.plans,
    queryFn: ({ signal }) => api.getPlans({ signal }),
  })
}

/** Quem é o visitante e o que assina — uma chave para `assinar` e para Ajustes. */
export function useMe() {
  const { userId, keys } = useKeys()

  return useQuery({
    queryKey: keys.me(),
    enabled: Boolean(userId),
    staleTime: STALE.me,
    queryFn: ({ signal }) => api.getMe({ signal }),
  })
}

// ---------------------------------------------------------------------------
// Admin — `staleTime: 0`, o editor não pode mostrar rascunho velho
// ---------------------------------------------------------------------------

export function useAdminPosts() {
  const { userId, keys } = useKeys()

  return useQuery({
    queryKey: keys.admin.posts(),
    enabled: Boolean(userId),
    staleTime: STALE.admin,
    queryFn: ({ signal }) => api.getAdminPosts({ signal }),
  })
}

export function useAdminPost(postId: string, enabled = true) {
  const { userId, keys } = useKeys()

  return useQuery({
    queryKey: keys.admin.post(postId),
    enabled: Boolean(userId && postId && enabled),
    staleTime: STALE.admin,
    queryFn: ({ signal }) => api.getAdminPost(postId, { signal }),
  })
}

export function useAdminCourses() {
  const { userId, keys } = useKeys()

  return useQuery({
    queryKey: keys.admin.courses(),
    enabled: Boolean(userId),
    staleTime: STALE.admin,
    queryFn: ({ signal }) => api.getAdminCourses({ signal }),
  })
}

export function useAdminCourse(courseId: string, enabled = true) {
  const { userId, keys } = useKeys()

  return useQuery({
    queryKey: keys.admin.course(courseId),
    enabled: Boolean(userId && courseId && enabled),
    staleTime: STALE.admin,
    queryFn: ({ signal }) => api.getAdminCourse(courseId, { signal }),
  })
}

export function useAdminPlans() {
  const { userId, keys } = useKeys()

  return useQuery({
    queryKey: keys.admin.plans(),
    enabled: Boolean(userId),
    staleTime: STALE.admin,
    queryFn: ({ signal }) => api.getAdminPlans({ signal }),
  })
}
