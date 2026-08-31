import { zql } from 'on-zero'

import { canAccessCourse, canAccessPost } from '~/data/where/canAccessContent'

// Queries do admin de conteúdo.
//
// Não existe permission especial aqui: `canAccessPost`/`canAccessCourse` já começam com
// `cmp('feedOwnerId', userId)`, então **o dono do feed enxerga o que é dele mesmo
// despublicado ou apagado**. É o mesmo gate do app, olhado do lado de dentro — nenhuma
// query nova precisou afrouxar nada.
//
// Por isso o criador administra o conteúdo dele sem ser `role = 'admin'`.

/** Todos os posts do criador, inclusive rascunho e apagado, do mais novo para o mais velho. */
export const adminPosts = (props: {
  feedOwnerId: string
  userId: string
  limit?: number
}) => {
  return zql.post
    .where(canAccessPost)
    .where('feedOwnerId', props.feedOwnerId)
    .orderBy('createdAt', 'desc')
    .limit(props.limit ?? 50)
    .related('feedOwner', (q) => q.one())
    .related('requiredPlan', (q) => q.one())
    .related('media', (q) =>
      q.orderBy('position', 'asc').related('media', (m) => m.one()),
    )
}

/** Um post para editar. Sem filtro de `deleted`: o admin precisa ver o que apagou. */
export const adminPost = (props: { postId: string; userId: string }) => {
  return zql.post
    .where(canAccessPost)
    .where('id', props.postId)
    .one()
    .related('requiredPlan', (q) => q.one())
    .related('media', (q) =>
      q.orderBy('position', 'asc').related('media', (m) => m.one()),
    )
}

/** Todos os cursos do criador, inclusive despublicados. */
export const adminCourses = (props: { feedOwnerId: string; userId: string }) => {
  return zql.course
    .where(canAccessCourse)
    .where('feedOwnerId', props.feedOwnerId)
    .orderBy('order', 'asc')
    .related('coverMedia', (q) => q.one())
    .related('requiredPlan', (q) => q.one())
    .related('modules', (q) => q.orderBy('order', 'asc'))
    .related('lessons', (q) => q.orderBy('order', 'asc'))
}

/**
 * Um curso para editar, com módulos e aulas — **inclusive as despublicadas**, que é a
 * diferença para o `courseBySlug` que a tela pública usa.
 */
export const adminCourse = (props: { courseId: string; userId: string }) => {
  return zql.course
    .where(canAccessCourse)
    .where('id', props.courseId)
    .one()
    .related('coverMedia', (q) => q.one())
    .related('requiredPlan', (q) => q.one())
    .related('modules', (q) => q.orderBy('order', 'asc'))
    .related('lessons', (q) => q.orderBy('order', 'asc').related('media', (m) => m.one()))
}
