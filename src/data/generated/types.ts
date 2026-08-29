import type { TableInsertRow, TableUpdateRow } from 'on-zero'
import type * as schema from './tables'

export type Comment = TableInsertRow<typeof schema.comment>
export type CommentUpdate = TableUpdateRow<typeof schema.comment>

export type Course = TableInsertRow<typeof schema.course>
export type CourseUpdate = TableUpdateRow<typeof schema.course>

export type CourseModule = TableInsertRow<typeof schema.courseModule>
export type CourseModuleUpdate = TableUpdateRow<typeof schema.courseModule>

export type Lesson = TableInsertRow<typeof schema.lesson>
export type LessonUpdate = TableUpdateRow<typeof schema.lesson>

export type LessonProgress = TableInsertRow<typeof schema.lessonProgress>
export type LessonProgressUpdate = TableUpdateRow<typeof schema.lessonProgress>

export type Media = TableInsertRow<typeof schema.media>
export type MediaUpdate = TableUpdateRow<typeof schema.media>

export type Plan = TableInsertRow<typeof schema.plan>
export type PlanUpdate = TableUpdateRow<typeof schema.plan>

export type Post = TableInsertRow<typeof schema.post>
export type PostUpdate = TableUpdateRow<typeof schema.post>

export type PostMedia = TableInsertRow<typeof schema.postMedia>
export type PostMediaUpdate = TableUpdateRow<typeof schema.postMedia>

export type Reaction = TableInsertRow<typeof schema.reaction>
export type ReactionUpdate = TableUpdateRow<typeof schema.reaction>

export type Subscription = TableInsertRow<typeof schema.subscription>
export type SubscriptionUpdate = TableUpdateRow<typeof schema.subscription>

export type User = TableInsertRow<typeof schema.userPublic>
export type UserUpdate = TableUpdateRow<typeof schema.userPublic>

export type UserState = TableInsertRow<typeof schema.userState>
export type UserStateUpdate = TableUpdateRow<typeof schema.userState>
