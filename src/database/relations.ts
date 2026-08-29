import { defineRelations } from 'drizzle-orm'
import * as schema from './schema'

export const relations = defineRelations(schema, (r) => ({
  // --- private tables ---

  user: {
    accounts: r.many.account({
      from: r.user.id,
      to: r.account.userId,
    }),
    sessions: r.many.session({
      from: r.user.id,
      to: r.session.userId,
    }),
    payments: r.many.payment({
      from: r.user.id,
      to: r.payment.userId,
    }),
  },

  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },

  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },

  payment: {
    user: r.one.user({
      from: r.payment.userId,
      to: r.user.id,
    }),
    subscription: r.one.subscription({
      from: r.payment.subscriptionId,
      to: r.subscription.id,
      optional: true,
    }),
  },

  // --- public tables ---

  userPublic: {
    state: r.one.userState({
      from: r.userPublic.id,
      to: r.userState.userId,
    }),
    posts: r.many.post({
      from: r.userPublic.id,
      to: r.post.feedOwnerId,
    }),
    media: r.many.media({
      from: r.userPublic.id,
      to: r.media.ownerId,
    }),
    comments: r.many.comment({
      from: r.userPublic.id,
      to: r.comment.userId,
    }),
    reactions: r.many.reaction({
      from: r.userPublic.id,
      to: r.reaction.userId,
    }),
    courses: r.many.course({
      from: r.userPublic.id,
      to: r.course.feedOwnerId,
    }),
    lessonProgress: r.many.lessonProgress({
      from: r.userPublic.id,
      to: r.lessonProgress.userId,
    }),
    // subscriptions this user pays for
    subscriptions: r.many.subscription({
      alias: 'subscription_subscriber',
      from: r.userPublic.id,
      to: r.subscription.userId,
    }),
    // subscriptions other users hold to this user's content
    subscribers: r.many.subscription({
      alias: 'subscription_creator',
      from: r.userPublic.id,
      to: r.subscription.creatorId,
    }),
  },

  userState: {
    user: r.one.userPublic({
      from: r.userState.userId,
      to: r.userPublic.id,
    }),
  },

  plan: {
    subscriptions: r.many.subscription({
      from: r.plan.id,
      to: r.subscription.planId,
    }),
  },

  subscription: {
    user: r.one.userPublic({
      alias: 'subscription_subscriber',
      from: r.subscription.userId,
      to: r.userPublic.id,
    }),
    creator: r.one.userPublic({
      alias: 'subscription_creator',
      from: r.subscription.creatorId,
      to: r.userPublic.id,
    }),
    plan: r.one.plan({
      from: r.subscription.planId,
      to: r.plan.id,
    }),
  },

  media: {
    owner: r.one.userPublic({
      from: r.media.ownerId,
      to: r.userPublic.id,
    }),
    postMedia: r.many.postMedia({
      from: r.media.id,
      to: r.postMedia.mediaId,
    }),
    lessons: r.many.lesson({
      from: r.media.id,
      to: r.lesson.mediaId,
    }),
    coverOf: r.many.course({
      from: r.media.id,
      to: r.course.coverMediaId,
    }),
  },

  post: {
    feedOwner: r.one.userPublic({
      from: r.post.feedOwnerId,
      to: r.userPublic.id,
    }),
    requiredPlan: r.one.plan({
      from: r.post.requiredPlanId,
      to: r.plan.id,
      optional: true,
    }),
    media: r.many.postMedia({
      from: r.post.id,
      to: r.postMedia.postId,
    }),
    comments: r.many.comment({
      from: r.post.id,
      to: r.comment.postId,
    }),
    reactions: r.many.reaction({
      from: r.post.id,
      to: r.reaction.postId,
    }),
  },

  postMedia: {
    post: r.one.post({
      from: r.postMedia.postId,
      to: r.post.id,
    }),
    media: r.one.media({
      from: r.postMedia.mediaId,
      to: r.media.id,
    }),
  },

  comment: {
    post: r.one.post({
      from: r.comment.postId,
      to: r.post.id,
    }),
    user: r.one.userPublic({
      from: r.comment.userId,
      to: r.userPublic.id,
    }),
    parent: r.one.comment({
      alias: 'comment_thread',
      from: r.comment.parentId,
      to: r.comment.id,
      optional: true,
    }),
    replies: r.many.comment({
      alias: 'comment_thread',
      from: r.comment.id,
      to: r.comment.parentId,
    }),
  },

  reaction: {
    post: r.one.post({
      from: r.reaction.postId,
      to: r.post.id,
    }),
    user: r.one.userPublic({
      from: r.reaction.userId,
      to: r.userPublic.id,
    }),
  },

  course: {
    feedOwner: r.one.userPublic({
      from: r.course.feedOwnerId,
      to: r.userPublic.id,
    }),
    coverMedia: r.one.media({
      from: r.course.coverMediaId,
      to: r.media.id,
      optional: true,
    }),
    requiredPlan: r.one.plan({
      from: r.course.requiredPlanId,
      to: r.plan.id,
      optional: true,
    }),
    modules: r.many.courseModule({
      from: r.course.id,
      to: r.courseModule.courseId,
    }),
    lessons: r.many.lesson({
      from: r.course.id,
      to: r.lesson.courseId,
    }),
  },

  courseModule: {
    course: r.one.course({
      from: r.courseModule.courseId,
      to: r.course.id,
    }),
    lessons: r.many.lesson({
      from: r.courseModule.id,
      to: r.lesson.moduleId,
    }),
  },

  lesson: {
    course: r.one.course({
      from: r.lesson.courseId,
      to: r.course.id,
    }),
    module: r.one.courseModule({
      from: r.lesson.moduleId,
      to: r.courseModule.id,
      optional: true,
    }),
    media: r.one.media({
      from: r.lesson.mediaId,
      to: r.media.id,
      optional: true,
    }),
    progress: r.many.lessonProgress({
      from: r.lesson.id,
      to: r.lessonProgress.lessonId,
    }),
  },

  lessonProgress: {
    user: r.one.userPublic({
      from: r.lessonProgress.userId,
      to: r.userPublic.id,
    }),
    lesson: r.one.lesson({
      from: r.lessonProgress.lessonId,
      to: r.lesson.id,
    }),
  },
}))
