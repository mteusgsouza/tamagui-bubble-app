// As escritas do leitor, com o otimismo que o Zero dava de graça.

import { useMutation, useQueryClient } from '@tanstack/react-query'

import * as api from './api'
import { patchPost, restore } from './cache'
import { useKeys } from './hooks'

import type { PostDTO } from '~/server/content/dto'

/**
 * Curtir e descurtir.
 *
 * 🔴 **Sem `invalidateQueries` no fim.** Invalidar o feed refaz sete queries no servidor
 * e pisca a lista inteira por causa de um coração. O servidor devolve `{liked,
 * likeCount}` autoritativo, e escrever isso no cache basta — só o erro restaura.
 */
export function useToggleLike() {
  const client = useQueryClient()
  const { keys } = useKeys()

  return useMutation({
    mutationFn: (args: { postId: string; liked: boolean }) => api.saveReaction(args),

    onMutate: async ({ postId, liked }) => {
      // a requisição em voo não pode sobrescrever o que acabamos de pintar
      await client.cancelQueries({ queryKey: keys.root })
      const snapshot = patchPost(client, keys, postId, (item) => ({
        ...item,
        liked,
        likeCount: Math.max(0, item.likeCount + (liked ? 1 : -1)),
      }))
      return { snapshot }
    },

    onError: (_error, _args, context) => restore(client, context?.snapshot),

    onSuccess: (result) => {
      patchPost(client, keys, result.postId, (item) => ({
        ...item,
        liked: result.liked,
        likeCount: result.likeCount,
      }))
    },
  })
}

export function useCreateComment(postId: string) {
  const client = useQueryClient()
  const { keys } = useKeys()

  return useMutation({
    mutationFn: (args: { body: string; parentId?: string | null }) =>
      api.createComment({ postId, ...args }),

    onSuccess: (result) => {
      // o contador aparece na lista e no detalhe; o comentário em si só no detalhe
      patchPost(client, keys, postId, (item) => ({
        ...item,
        commentCount: result.commentCount,
      }))
      void client.invalidateQueries({ queryKey: keys.post(postId) })
    },
  })
}

export function useDeleteComment(postId: string) {
  const client = useQueryClient()
  const { keys } = useKeys()

  return useMutation({
    mutationFn: (commentId: string) => api.removeComment(commentId),

    onSuccess: (result) => {
      patchPost(client, keys, postId, (item) => ({
        ...item,
        commentCount: result.commentCount,
      }))
      void client.invalidateQueries({ queryKey: keys.post(postId) })
    },
  })
}

/**
 * Progresso de aula: dispara e esquece, sem otimismo.
 *
 * O player já é a fonte de verdade da posição — pintar o que ele mesmo mandou seria
 * redundante. ⚠️ **Invalidar só quando a aula é concluída**; a cada 10 s do throttle
 * seria refazer o curso inteiro por causa de um segundo de vídeo.
 */
export function useSaveProgress(courseSlug?: string) {
  const client = useQueryClient()
  const { keys } = useKeys()

  return useMutation({
    mutationFn: (args: { lessonId: string; positionSec: number; completed?: boolean }) =>
      api.saveProgress(args),

    onSuccess: (result, args) => {
      client.setQueryData(keys.lesson(args.lessonId), (current: unknown) => {
        if (typeof current !== 'object' || current === null) return current
        const envelope = current as { lesson: { progress: unknown[] } }
        return {
          ...envelope,
          lesson: {
            ...envelope.lesson,
            progress: [
              {
                id: 'local',
                positionSec: result.positionSec,
                completedAt: result.completedAt,
                updatedAt: Date.now(),
              },
            ],
          },
        }
      })

      if (args.completed) {
        void client.invalidateQueries({ queryKey: keys.courses() })
        if (courseSlug) void client.invalidateQueries({ queryKey: keys.course(courseSlug) })
      }
    },
  })
}

/**
 * Depois de qualquer escrita de admin: invalida o editor **e** a superfície pública
 * correspondente. Grosso e correto — o admin é de baixo tráfego, e publicar um post que
 * não aparece no feed seria pior do que uma requisição a mais.
 */
export function useInvalidateAfterAdminWrite() {
  const client = useQueryClient()
  const { keys } = useKeys()

  return () => {
    void client.invalidateQueries({ queryKey: keys.admin.root() })
    void client.invalidateQueries({ queryKey: keys.feed() })
    void client.invalidateQueries({ queryKey: keys.courses() })
    void client.invalidateQueries({ queryKey: keys.plans() })
  }
}

export type { PostDTO }
