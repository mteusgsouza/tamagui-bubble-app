// As chaves do cache.
//
// 🔴 **O usuário entra na chave, não na árvore.** Com o Zero, trocar de conta exigia
// derrubar o provider; aqui basta a chave mudar — o cache da conta anterior simplesmente
// não é alcançado, sem effect de limpeza e sem corrida com requisição em voo. É o que
// permite `ProvideQueryClient` nunca remontar (ver a invariante 10 em `queryClient.tsx`).

export const qk = (userId: string) => ({
  /** raiz do usuário: invalidar isto alcança tudo que é dele */
  root: ['u', userId] as const,

  feed: () => ['u', userId, 'feed'] as const,
  post: (postId: string) => ['u', userId, 'post', postId] as const,
  courses: () => ['u', userId, 'courses'] as const,
  course: (slug: string) => ['u', userId, 'course', slug] as const,
  lesson: (lessonId: string) => ['u', userId, 'lesson', lessonId] as const,
  plans: () => ['u', userId, 'plans'] as const,
  me: () => ['u', userId, 'me'] as const,

  admin: {
    root: () => ['u', userId, 'admin'] as const,
    posts: () => ['u', userId, 'admin', 'posts'] as const,
    post: (postId: string) => ['u', userId, 'admin', 'post', postId] as const,
    courses: () => ['u', userId, 'admin', 'courses'] as const,
    course: (courseId: string) => ['u', userId, 'admin', 'course', courseId] as const,
    plans: () => ['u', userId, 'admin', 'plans'] as const,
  },
})

/**
 * Quanto tempo cada superfície fica "fresca".
 *
 * O admin é **zero** de propósito: o editor não pode mostrar rascunho velho depois de
 * salvar. O resto se apoia no refetch por foco.
 */
export const STALE = {
  feed: 30_000,
  post: 30_000,
  courses: 60_000,
  lesson: 60_000,
  plans: 5 * 60_000,
  me: 60_000,
  admin: 0,
} as const
