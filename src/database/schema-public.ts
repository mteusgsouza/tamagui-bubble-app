import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import type { AnyPgColumn } from 'drizzle-orm/pg-core'

// every table in this file is replicated to zero: src/database/migrate.ts builds the
// `zero_takeout` publication from every table that is NOT in schema-private.ts.
// timestamps use `mode: 'string'` here; the zero column is `number()` (epoch ms).

// --- users ---

export const userPublic = pgTable(
  'userPublic',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    username: text('username'),
    image: text('image'),
    joinedAt: timestamp('joinedAt', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [index('userPublic_username_idx').on(table.username)],
)

export const userState = pgTable('userState', {
  userId: text('userId').primaryKey(),
  darkMode: boolean('darkMode').notNull().default(false),
})

// --- subscription ---

export const plan = pgTable(
  'plan',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    priceCents: integer('priceCents').notNull().default(0),
    currency: text('currency').notNull().default('BRL'),
    interval: text('interval', { enum: ['month', 'year'] })
      .notNull()
      .default('month'),
    active: boolean('active').notNull().default(true),
    order: integer('order').notNull().default(0),
  },
  (table) => [uniqueIndex('plan_slug_uidx').on(table.slug)],
)

export const subscription = pgTable(
  'subscription',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => userPublic.id, { onDelete: 'cascade' }),
    // the creator whose content this subscription unlocks
    creatorId: text('creatorId')
      .notNull()
      .references(() => userPublic.id, { onDelete: 'cascade' }),
    planId: text('planId')
      .notNull()
      .references(() => plan.id),
    provider: text('provider').notNull().default('manual'),
    providerSubscriptionId: text('providerSubscriptionId'),
    status: text('status', {
      enum: ['trialing', 'active', 'past_due', 'canceled', 'expired'],
    })
      .notNull()
      .default('active'),
    currentPeriodEnd: timestamp('currentPeriodEnd', { mode: 'string' }),
    cancelAtPeriodEnd: boolean('cancelAtPeriodEnd').notNull().default(false),
    createdAt: timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    // the paywall join: is there an active subscription from this user to this creator
    index('subscription_userId_creatorId_status_idx').on(
      table.userId,
      table.creatorId,
      table.status,
    ),
    index('subscription_creatorId_idx').on(table.creatorId),
    index('subscription_planId_idx').on(table.planId),
  ],
)

// --- media ---

export const media = pgTable(
  'media',
  {
    id: text('id').primaryKey(),
    ownerId: text('ownerId')
      .notNull()
      .references(() => userPublic.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['r2'] })
      .notNull()
      .default('r2'),
    storageKey: text('storageKey').notNull(),
    // still frame for video/audio, uploaded as its own object
    posterKey: text('posterKey'),
    mime: text('mime').notNull(),
    kind: text('kind', { enum: ['photo', 'video', 'audio'] }).notNull(),
    // int4 caps a single file at ~2.1 GB, far above the app-level upload limit
    sizeBytes: integer('sizeBytes').notNull().default(0),
    durationSec: integer('durationSec'),
    width: integer('width'),
    height: integer('height'),
    status: text('status', { enum: ['pending', 'ready', 'failed'] })
      .notNull()
      .default('pending'),
    createdAt: timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [index('media_ownerId_createdAt_idx').on(table.ownerId, table.createdAt)],
)

// --- feed ---

export const post = pgTable(
  'post',
  {
    id: text('id').primaryKey(),
    // owner of the feed this post belongs to: the join key the paywall needs
    feedOwnerId: text('feedOwnerId')
      .notNull()
      .references(() => userPublic.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['text', 'photo', 'video', 'audio'] }).notNull(),
    title: text('title'),
    body: text('body'),
    visibility: text('visibility', { enum: ['public', 'subscribers'] })
      .notNull()
      .default('subscribers'),
    requiredPlanId: text('requiredPlanId').references(() => plan.id),
    published: boolean('published').notNull().default(false),
    publishedAt: timestamp('publishedAt', { mode: 'string' }),
    // denormalized counters, maintained by the comment/reaction mutations
    likeCount: integer('likeCount').notNull().default(0),
    commentCount: integer('commentCount').notNull().default(0),
    deleted: boolean('deleted').notNull().default(false),
    createdAt: timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('post_feedOwnerId_publishedAt_idx').on(table.feedOwnerId, table.publishedAt),
    index('post_feedOwnerId_createdAt_idx').on(table.feedOwnerId, table.createdAt),
    index('post_requiredPlanId_idx').on(table.requiredPlanId),
  ],
)

export const postMedia = pgTable(
  'postMedia',
  {
    id: text('id').primaryKey(),
    postId: text('postId')
      .notNull()
      .references(() => post.id, { onDelete: 'cascade' }),
    mediaId: text('mediaId')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [
    index('postMedia_postId_position_idx').on(table.postId, table.position),
    uniqueIndex('postMedia_postId_mediaId_uidx').on(table.postId, table.mediaId),
    index('postMedia_mediaId_idx').on(table.mediaId),
  ],
)

export const comment = pgTable(
  'comment',
  {
    id: text('id').primaryKey(),
    postId: text('postId')
      .notNull()
      .references(() => post.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => userPublic.id, { onDelete: 'cascade' }),
    // threading: null = top level
    parentId: text('parentId').references((): AnyPgColumn => comment.id, {
      onDelete: 'cascade',
    }),
    body: text('body').notNull(),
    deleted: boolean('deleted').notNull().default(false),
    createdAt: timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('comment_postId_createdAt_idx').on(table.postId, table.createdAt),
    index('comment_parentId_idx').on(table.parentId),
    index('comment_userId_idx').on(table.userId),
  ],
)

export const reaction = pgTable(
  'reaction',
  {
    id: text('id').primaryKey(),
    postId: text('postId')
      .notNull()
      .references(() => post.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => userPublic.id, { onDelete: 'cascade' }),
    type: text('type').notNull().default('like'),
    createdAt: timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('reaction_postId_userId_type_uidx').on(
      table.postId,
      table.userId,
      table.type,
    ),
    index('reaction_userId_idx').on(table.userId),
  ],
)

// --- courses ---

export const course = pgTable(
  'course',
  {
    id: text('id').primaryKey(),
    feedOwnerId: text('feedOwnerId')
      .notNull()
      .references(() => userPublic.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    coverMediaId: text('coverMediaId').references(() => media.id, {
      onDelete: 'set null',
    }),
    visibility: text('visibility', { enum: ['public', 'subscribers'] })
      .notNull()
      .default('subscribers'),
    requiredPlanId: text('requiredPlanId').references(() => plan.id),
    published: boolean('published').notNull().default(false),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('course_feedOwnerId_slug_uidx').on(table.feedOwnerId, table.slug),
    index('course_feedOwnerId_order_idx').on(table.feedOwnerId, table.order),
    index('course_coverMediaId_idx').on(table.coverMediaId),
  ],
)

export const courseModule = pgTable(
  'courseModule',
  {
    id: text('id').primaryKey(),
    courseId: text('courseId')
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    order: integer('order').notNull().default(0),
  },
  (table) => [index('courseModule_courseId_order_idx').on(table.courseId, table.order)],
)

export const lesson = pgTable(
  'lesson',
  {
    id: text('id').primaryKey(),
    courseId: text('courseId')
      .notNull()
      .references(() => course.id, { onDelete: 'cascade' }),
    // null = lesson sits directly under the course, outside any module
    moduleId: text('moduleId').references(() => courseModule.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    body: text('body'),
    mediaId: text('mediaId').references(() => media.id, { onDelete: 'set null' }),
    durationSec: integer('durationSec'),
    order: integer('order').notNull().default(0),
    published: boolean('published').notNull().default(false),
    // visible without an active subscription, even on a subscribers-only course
    freePreview: boolean('freePreview').notNull().default(false),
    createdAt: timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    index('lesson_courseId_order_idx').on(table.courseId, table.order),
    index('lesson_moduleId_order_idx').on(table.moduleId, table.order),
    index('lesson_mediaId_idx').on(table.mediaId),
  ],
)

export const lessonProgress = pgTable(
  'lessonProgress',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => userPublic.id, { onDelete: 'cascade' }),
    lessonId: text('lessonId')
      .notNull()
      .references(() => lesson.id, { onDelete: 'cascade' }),
    positionSec: integer('positionSec').notNull().default(0),
    completedAt: timestamp('completedAt', { mode: 'string' }),
    updatedAt: timestamp('updatedAt', { mode: 'string' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('lessonProgress_userId_lessonId_uidx').on(table.userId, table.lessonId),
    index('lessonProgress_lessonId_idx').on(table.lessonId),
  ],
)
