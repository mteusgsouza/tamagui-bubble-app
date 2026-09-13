import { index, pgTable, uniqueIndex } from 'drizzle-orm/pg-core'

import { plan, subscription } from './schema-public'

import type { InferSelectModel } from 'drizzle-orm'

export const user = pgTable('user', (t) => ({
  id: t.varchar('id').primaryKey(),
  username: t.varchar('username', { length: 200 }),
  name: t.varchar('name', { length: 200 }),
  email: t.varchar('email', { length: 200 }).notNull().unique(),
  normalizedEmail: t.varchar('normalizedEmail', { length: 200 }).unique(),
  updatedAt: t.timestamp('updatedAt', { mode: 'string' }).defaultNow(),
  emailVerified: t.boolean('emailVerified').default(false).notNull(),
  image: t.text('image'),
  createdAt: t.timestamp('createdAt', { mode: 'string' }).defaultNow(),
  role: t.varchar('role').default('user').notNull(),
  banned: t.boolean('banned').default(false).notNull(),
  banReason: t.varchar('banReason'),
  banExpires: t.bigint('banExpires', { mode: 'number' }),
}))

export type UserPrivate = InferSelectModel<typeof user>

export const account = pgTable('account', (t) => ({
  id: t.text('id').primaryKey().notNull(),
  accountId: t.text('accountId').notNull(),
  providerId: t.text('providerId').notNull(),
  userId: t
    .text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: t.text('accessToken'),
  refreshToken: t.text('refreshToken'),
  idToken: t.text('idToken'),
  accessTokenExpiresAt: t.timestamp('accessTokenExpiresAt', { mode: 'string' }),
  refreshTokenExpiresAt: t.timestamp('refreshTokenExpiresAt', { mode: 'string' }),
  scope: t.text('scope'),
  password: t.text('password'),
  createdAt: t.timestamp('createdAt', { mode: 'string' }).notNull(),
  updatedAt: t.timestamp('updatedAt', { mode: 'string' }).notNull(),
}))

export const session = pgTable('session', (t) => ({
  id: t.text('id').primaryKey().notNull(),
  expiresAt: t.timestamp('expiresAt', { mode: 'string' }).notNull(),
  token: t.text('token').notNull(),
  createdAt: t.timestamp('createdAt', { mode: 'string' }).notNull(),
  updatedAt: t.timestamp('updatedAt', { mode: 'string' }).notNull(),
  ipAddress: t.text('ipAddress'),
  userAgent: t.text('userAgent'),
  userId: t
    .text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: t.varchar('impersonatedBy'),
}))

export const jwks = pgTable('jwks', (t) => ({
  id: t.text('id').primaryKey().notNull(),
  publicKey: t.text('publicKey').notNull(),
  privateKey: t.text('privateKey').notNull(),
  createdAt: t.timestamp('createdAt', { mode: 'string' }).notNull(),
}))

export const verification = pgTable('verification', (t) => ({
  id: t.text('id').primaryKey().notNull(),
  identifier: t.text('identifier').notNull(),
  value: t.text('value').notNull(),
  expiresAt: t.timestamp('expiresAt', { mode: 'string' }).notNull(),
  createdAt: t.timestamp('createdAt', { mode: 'string' }),
  updatedAt: t.timestamp('updatedAt', { mode: 'string' }),
}))

// --- billing ---

// private on purpose: never replicated to zero, so it stays out of the
// `zero_takeout` publication (see src/database/migrate.ts). read/write only
// through server actions.
export const payment = pgTable(
  'payment',
  (t) => ({
    id: t.text('id').primaryKey(),
    userId: t
      .text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    subscriptionId: t
      .text('subscriptionId')
      .references(() => subscription.id, { onDelete: 'set null' }),
    provider: t.text('provider').notNull().default('manual'),
    providerPaymentId: t.text('providerPaymentId'),
    amountCents: t.integer('amountCents').notNull().default(0),
    currency: t.text('currency').notNull().default('BRL'),
    status: t.text('status').notNull().default('paid'),
    paidAt: t.timestamp('paidAt', { mode: 'string' }),
    createdAt: t.timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
  }),
  (table) => [
    index('payment_userId_idx').on(table.userId),
    index('payment_subscriptionId_idx').on(table.subscriptionId),
  ],
)

export type Payment = InferSelectModel<typeof payment>

// --- ponte com o gateway ---
//
// As duas tabelas abaixo traduzem o nosso vocabulário para o do gateway, e por isso são
// **privadas**: `customerId` e `providerPriceId` são encanamento de cobrança, que
// nenhuma tela precisa ver. Ficando fora da publication do Zero, elas não geram model
// novo, não exigem `zero:generate` e não obrigam a reconstruir o replica.

/**
 * O cliente de cada usuário no gateway.
 *
 * Sem isto, cada checkout cria um customer novo no Stripe e o histórico da pessoa se
 * estilhaça — e o Customer Portal, que é por customer, deixa de fazer sentido.
 */
export const billingCustomer = pgTable(
  'billingCustomer',
  (t) => ({
    userId: t
      .text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: t.text('provider').notNull(),
    customerId: t.text('customerId').notNull(),
    createdAt: t.timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
  }),
  (table) => [
    uniqueIndex('billingCustomer_userId_provider_uidx').on(table.userId, table.provider),
    index('billingCustomer_customerId_idx').on(table.customerId),
  ],
)

/**
 * O `price_id` de cada plano no gateway.
 *
 * **Tabela, e não uma coluna em `plan`, por três razões:**
 *
 * 1. `plan` é público e sincronizado pelo Zero; `price_id` não tem o que fazer lá.
 * 2. A decisão 4 do `STATE` é pagamento abstraído — um `stripe_` no schema público
 *    amarraria o catálogo a um gateway.
 * 3. **Price no Stripe é imutável:** mudar o valor é criar um Price novo. Quem já assina
 *    continua no antigo (o mesmo grandfathering da decisão 16, que nunca apaga plano) e o
 *    novo vale para quem entra. Com uma coluna só, um dos dois se perderia; com `active`
 *    na linha, os dois coexistem e a intenção fica legível.
 */
export const planProviderPrice = pgTable(
  'planProviderPrice',
  (t) => ({
    id: t.text('id').primaryKey(),
    planId: t
      .text('planId')
      .notNull()
      .references(() => plan.id, { onDelete: 'cascade' }),
    provider: t.text('provider').notNull(),
    providerPriceId: t.text('providerPriceId').notNull(),
    /** `false` = preço aposentado, mantido porque assinatura antiga ainda aponta pra ele */
    active: t.boolean('active').notNull().default(true),
    createdAt: t.timestamp('createdAt', { mode: 'string' }).defaultNow().notNull(),
  }),
  (table) => [
    uniqueIndex('planProviderPrice_providerPriceId_uidx').on(table.providerPriceId),
    index('planProviderPrice_planId_provider_idx').on(table.planId, table.provider),
  ],
)
