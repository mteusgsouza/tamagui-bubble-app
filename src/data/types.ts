import type { User, UserState } from './generated/types'

export type * from './generated/types'

export type UserWithState = User & {
  state?: UserState
}

// Argumentos das mutations customizadas. Não saem do gerador (que só deriva os tipos
// das colunas), então são re-exportados à mão — a UI importa daqui, não do model.
export type { PostIdArgs, PostKind, PublishPostArgs, Visibility } from './models/post'
export type { CommentIdArgs } from './models/comment'
export type { ToggleReactionArgs } from './models/reaction'
export type { SaveProgressArgs } from './models/lessonProgress'
export type { MediaKind, MediaStatus } from './models/media'
export type { SubscriptionStatus } from './models/subscription'
