// Os enums do domínio, derivados do schema do Drizzle.
//
// Fonte única: as colunas são `text('kind', { enum: [...] })` (decisão 6 do `STATE` —
// nunca `pgEnum`), então o tipo sai do próprio schema em vez de uma segunda lista para
// envelhecer. Substitui `~/data/types`, que derivava do schema do Zero.
//
// Os `is*` existem porque corpo de requisição é `unknown`: validar no limite da rota é o
// que transforma "enum inválido" em 422 legível, em vez de um erro do Postgres num
// `check constraint` ou — pior — uma linha gravada com valor que nenhuma tela entende.

import { lesson, media, plan, post } from '~/database/schema-public'

export type PostKind = typeof post.$inferSelect['kind']
export type Visibility = typeof post.$inferSelect['visibility']
export type MediaKind = typeof media.$inferSelect['kind']
export type MediaStatus = typeof media.$inferSelect['status']
export type PlanInterval = typeof plan.$inferSelect['interval']

export type Plan = typeof plan.$inferSelect
export type Post = typeof post.$inferSelect
export type Lesson = typeof lesson.$inferSelect

const POST_KINDS = ['text', 'photo', 'video', 'audio'] as const
const VISIBILITIES = ['public', 'subscribers'] as const
const PLAN_INTERVALS = ['month', 'year', 'once'] as const

export const isPostKind = (value: unknown): value is PostKind =>
  typeof value === 'string' && (POST_KINDS as readonly string[]).includes(value)

export const isVisibility = (value: unknown): value is Visibility =>
  typeof value === 'string' && (VISIBILITIES as readonly string[]).includes(value)

export const isPlanInterval = (value: unknown): value is PlanInterval =>
  typeof value === 'string' && (PLAN_INTERVALS as readonly string[]).includes(value)
