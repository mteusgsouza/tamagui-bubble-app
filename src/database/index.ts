import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { DATABASE_URL } from '~/server/env-server'

import './pgTypes'

import * as schemaPrivate from './schema-private'
import * as schemaPublic from './schema-public'

const schema = {
  ...schemaPublic,
  ...schemaPrivate,
}

export const createPool = (connectionString?: string) => {
  const connStr = connectionString || DATABASE_URL
  return new Pool({
    connectionString: connStr,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    // handle self-signed certificates in production
    ssl: connStr?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  })
}

/**
 * `DB_LOG=1` imprime cada statement.
 *
 * Existe para a disciplina que substitui o Zero: cada endpoint tem que gastar um número
 * **constante** de queries, e a única forma honesta de afirmar isso é contando. O
 * `log_min_duration_statement` do Postgres não serve aqui — o `-c` da linha de comando do
 * container tem precedência sobre `ALTER SYSTEM`, então não dá para ligar sem recriar o
 * serviço.
 */
export const createDb = () => {
  const pool = createPool()
  return drizzle({ client: pool, schema, logger: process.env.DB_LOG === '1' })
}

let db: ReturnType<typeof createDb>

export const getDb = () => {
  if (!db) {
    db = createDb()
  }
  return db
}
