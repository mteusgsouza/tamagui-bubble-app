import { Pool } from 'pg'

import { DATABASE_URL } from '~/server/env-server'

import './pgTypes'

if (!DATABASE_URL) {
  throw new Error(`No db string connection found`)
}

export const database = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: true,
  // handle self-signed certificates in production
  ssl: DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
})

database.on('error', (error) => {
  console.error(`[postgres] database error`, error)
})

// cleanup function that can be called during shutdown
export async function closeDatabase() {
  try {
    await database.end()
  } catch (error) {
    console.error(`[postgres] error closing database:`, error)
  }
}
