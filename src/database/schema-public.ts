import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

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
