import { relationships } from '@rocicorp/zero'

import * as tables from './generated/tables'

export const userRelationships = relationships(tables.userPublic, ({ one }) => ({
  state: one({
    sourceField: ['id'],
    destSchema: tables.userState,
    destField: ['userId'],
  }),
}))

export const userStateRelationships = relationships(tables.userState, ({ one }) => ({
  user: one({
    sourceField: ['userId'],
    destSchema: tables.userPublic,
    destField: ['id'],
  }),
}))

export const planRelationships = relationships(tables.plan, ({ many }) => ({
  subscriptions: many({
    sourceField: ['id'],
    destSchema: tables.subscription,
    destField: ['planId'],
  }),
}))

export const subscriptionRelationships = relationships(
  tables.subscription,
  ({ one }) => ({
    user: one({
      sourceField: ['userId'],
      destSchema: tables.userPublic,
      destField: ['id'],
    }),
    creator: one({
      sourceField: ['creatorId'],
      destSchema: tables.userPublic,
      destField: ['id'],
    }),
    plan: one({
      sourceField: ['planId'],
      destSchema: tables.plan,
      destField: ['id'],
    }),
  }),
)

export const mediaRelationships = relationships(tables.media, ({ one, many }) => ({
  owner: one({
    sourceField: ['ownerId'],
    destSchema: tables.userPublic,
    destField: ['id'],
  }),
  postMedia: many({
    sourceField: ['id'],
    destSchema: tables.postMedia,
    destField: ['mediaId'],
  }),
  // usada por `canAccessMedia`: mídia do criador que o usuário assina
  ownerSubscriptions: many({
    sourceField: ['ownerId'],
    destSchema: tables.subscription,
    destField: ['creatorId'],
  }),
  // dois saltos: media → postMedia → post
  posts: many(
    {
      sourceField: ['id'],
      destSchema: tables.postMedia,
      destField: ['mediaId'],
    },
    {
      sourceField: ['postId'],
      destSchema: tables.post,
      destField: ['id'],
    },
  ),
}))

export const postRelationships = relationships(tables.post, ({ one, many }) => ({
  feedOwner: one({
    sourceField: ['feedOwnerId'],
    destSchema: tables.userPublic,
    destField: ['id'],
  }),
  requiredPlan: one({
    sourceField: ['requiredPlanId'],
    destSchema: tables.plan,
    destField: ['id'],
  }),
  media: many({
    sourceField: ['id'],
    destSchema: tables.postMedia,
    destField: ['postId'],
  }),
  comments: many({
    sourceField: ['id'],
    destSchema: tables.comment,
    destField: ['postId'],
  }),
  reactions: many({
    sourceField: ['id'],
    destSchema: tables.reaction,
    destField: ['postId'],
  }),
  // ─── as duas relações que fazem o paywall existir ───
  // qualquer assinatura ao dono do feed
  creatorSubscriptions: many({
    sourceField: ['feedOwnerId'],
    destSchema: tables.subscription,
    destField: ['creatorId'],
  }),
  // assinatura ao dono do feed **naquele plano** — join de duas colunas, é o que
  // permite ao `postGate` respeitar `requiredPlanId` sem comparar coluna com coluna
  planSubscriptions: many({
    sourceField: ['feedOwnerId', 'requiredPlanId'],
    destSchema: tables.subscription,
    destField: ['creatorId', 'planId'],
  }),
}))

export const postMediaRelationships = relationships(tables.postMedia, ({ one }) => ({
  post: one({
    sourceField: ['postId'],
    destSchema: tables.post,
    destField: ['id'],
  }),
  media: one({
    sourceField: ['mediaId'],
    destSchema: tables.media,
    destField: ['id'],
  }),
}))

export const commentRelationships = relationships(tables.comment, ({ one, many }) => ({
  post: one({
    sourceField: ['postId'],
    destSchema: tables.post,
    destField: ['id'],
  }),
  user: one({
    sourceField: ['userId'],
    destSchema: tables.userPublic,
    destField: ['id'],
  }),
  parent: one({
    sourceField: ['parentId'],
    destSchema: tables.comment,
    destField: ['id'],
  }),
  replies: many({
    sourceField: ['id'],
    destSchema: tables.comment,
    destField: ['parentId'],
  }),
}))

export const reactionRelationships = relationships(tables.reaction, ({ one }) => ({
  post: one({
    sourceField: ['postId'],
    destSchema: tables.post,
    destField: ['id'],
  }),
  user: one({
    sourceField: ['userId'],
    destSchema: tables.userPublic,
    destField: ['id'],
  }),
}))

export const courseRelationships = relationships(tables.course, ({ one, many }) => ({
  feedOwner: one({
    sourceField: ['feedOwnerId'],
    destSchema: tables.userPublic,
    destField: ['id'],
  }),
  coverMedia: one({
    sourceField: ['coverMediaId'],
    destSchema: tables.media,
    destField: ['id'],
  }),
  requiredPlan: one({
    sourceField: ['requiredPlanId'],
    destSchema: tables.plan,
    destField: ['id'],
  }),
  modules: many({
    sourceField: ['id'],
    destSchema: tables.courseModule,
    destField: ['courseId'],
  }),
  lessons: many({
    sourceField: ['id'],
    destSchema: tables.lesson,
    destField: ['courseId'],
  }),
  // mesmo par do post: é o que o `courseGate` usa
  creatorSubscriptions: many({
    sourceField: ['feedOwnerId'],
    destSchema: tables.subscription,
    destField: ['creatorId'],
  }),
  planSubscriptions: many({
    sourceField: ['feedOwnerId', 'requiredPlanId'],
    destSchema: tables.subscription,
    destField: ['creatorId', 'planId'],
  }),
}))

export const courseModuleRelationships = relationships(
  tables.courseModule,
  ({ one, many }) => ({
    course: one({
      sourceField: ['courseId'],
      destSchema: tables.course,
      destField: ['id'],
    }),
    lessons: many({
      sourceField: ['id'],
      destSchema: tables.lesson,
      destField: ['moduleId'],
    }),
  }),
)

export const lessonRelationships = relationships(tables.lesson, ({ one, many }) => ({
  course: one({
    sourceField: ['courseId'],
    destSchema: tables.course,
    destField: ['id'],
  }),
  module: one({
    sourceField: ['moduleId'],
    destSchema: tables.courseModule,
    destField: ['id'],
  }),
  media: one({
    sourceField: ['mediaId'],
    destSchema: tables.media,
    destField: ['id'],
  }),
  progress: many({
    sourceField: ['id'],
    destSchema: tables.lessonProgress,
    destField: ['lessonId'],
  }),
}))

export const lessonProgressRelationships = relationships(
  tables.lessonProgress,
  ({ one }) => ({
    lesson: one({
      sourceField: ['lessonId'],
      destSchema: tables.lesson,
      destField: ['id'],
    }),
    user: one({
      sourceField: ['userId'],
      destSchema: tables.userPublic,
      destField: ['id'],
    }),
  }),
)

export const allRelationships = [
  userRelationships,
  userStateRelationships,
  planRelationships,
  subscriptionRelationships,
  mediaRelationships,
  postRelationships,
  postMediaRelationships,
  commentRelationships,
  reactionRelationships,
  courseRelationships,
  courseModuleRelationships,
  lessonRelationships,
  lessonProgressRelationships,
]
