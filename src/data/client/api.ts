// Uma função por endpoint. Os hooks chamam daqui, nunca `apiFetch` cru — assim o
// caminho de cada rota aparece uma vez só no código.
//
// ⚠️ **Sem `/api` nos caminhos.** `API_URL` já é `${SERVER_URL}/api`; prefixar de novo
// produz `/api/api/...` e **404**. Foi o bug que derrubou a tela de assinar.

import { apiFetch } from '~/helpers/apiFetch'

import type {
  CourseDTO,
  FeedPageDTO,
  LessonDetailDTO,
  MeDTO,
  PlanDTO,
  PostDTO,
} from '~/server/content/dto'
import type { AdminPostDTO } from '~/server/content/adminPosts'

type Init = { signal?: AbortSignal }

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

const post = <T>(path: string, body: unknown) =>
  apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) })

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export const getFeed = (args: { limit?: number; cursor?: string | null }, init?: Init) =>
  apiFetch<FeedPageDTO>(
    `/feed${query({ limit: args.limit, cursor: args.cursor ?? undefined })}`,
    init,
  )

export const getPost = (postId: string, init?: Init) =>
  apiFetch<{ post: PostDTO }>(`/post/${encodeURIComponent(postId)}`, init)

export const getCourses = (init?: Init) =>
  apiFetch<{ courses: CourseDTO[] }>('/courses', init)

export const getCourse = (slug: string, init?: Init) =>
  apiFetch<{ course: CourseDTO }>(`/course/${encodeURIComponent(slug)}`, init)

export const getLesson = (lessonId: string, init?: Init) =>
  apiFetch<{ lesson: LessonDetailDTO }>(`/lesson/${encodeURIComponent(lessonId)}`, init)

export const getPlans = (init?: Init) => apiFetch<{ plans: PlanDTO[] }>('/plans', init)

export const getMe = (init?: Init) => apiFetch<MeDTO>('/me', init)

// ---------------------------------------------------------------------------
// Escrita do leitor
// ---------------------------------------------------------------------------

export const saveReaction = (args: { postId: string; liked: boolean }) =>
  post<{ postId: string; liked: boolean; likeCount: number }>('/reactions', args)

export const createComment = (args: {
  postId: string
  body: string
  parentId?: string | null
}) =>
  post<{ comment: import('~/server/content/dto').CommentDTO; commentCount: number }>(
    '/comments',
    { action: 'create', ...args },
  )

export const removeComment = (commentId: string) =>
  post<{ commentId: string; commentCount: number }>('/comments', {
    action: 'delete',
    commentId,
  })

export const saveProgress = (args: {
  lessonId: string
  positionSec: number
  completed?: boolean
}) =>
  post<{ lessonId: string; positionSec: number; completedAt: number | null }>(
    '/progress',
    args,
  )

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const getAdminPosts = (init?: Init) =>
  apiFetch<{ posts: AdminPostDTO[] }>('/admin/posts', init)

export const getAdminPost = (postId: string, init?: Init) =>
  apiFetch<{ post: AdminPostDTO }>(`/admin/post/${encodeURIComponent(postId)}`, init)

export const getAdminCourses = (init?: Init) =>
  apiFetch<{ courses: CourseDTO[] }>('/admin/courses', init)

export const getAdminCourse = (courseId: string, init?: Init) =>
  apiFetch<{ course: CourseDTO }>(`/admin/course/${encodeURIComponent(courseId)}`, init)

export const getAdminPlans = (init?: Init) =>
  apiFetch<{ plans: PlanDTO[] }>('/admin/plans', init)

export const adminPosts = <T = { ok: true }>(body: Record<string, unknown>) =>
  post<T>('/admin/posts', body)

export const adminCourses = <T = { ok: true }>(body: Record<string, unknown>) =>
  post<T>('/admin/courses', body)

export const adminPlans = <T = { ok: true }>(body: Record<string, unknown>) =>
  post<T>('/admin/plans', body)
