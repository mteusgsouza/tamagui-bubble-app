import { migrate } from '@take-out/postgres/migrate'

import { DATABASE_URL } from '~/server/env-server'

const migrationsTS = import.meta.glob(`./migrations/*.ts`)

// vite tries to eval this at build time :/
const PROCESS_ENV = globalThis['process']['env']

export async function main() {
  console.info('🔄 waiting for database to be ready...')
  await waitForDatabase(DATABASE_URL)

  console.info('🚀 running migrations...')
  await migrate({
    connectionString: DATABASE_URL,
    migrationsGlob: migrationsTS,
    gitSha: process.env.GIT_SHA,
    // O default do runner é 5s. A migration da Fase 3 (12 CREATE TABLE + 25 índices +
    // 22 FKs numa query só) estoura isso num Postgres recém-inicializado, ainda mais
    // com o projeto em /mnt/f — disco Windows visto da WSL.
    defaultTimeout: 30_000,
  })
  console.info('✅ migrations complete')
}

if (PROCESS_ENV.RUN) {
  main().catch((err: unknown) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
}

async function waitForDatabase(connectionString: string, maxRetries = 30) {
  const { Pool } = await import('pg')

  for (let i = 0; i < maxRetries; i++) {
    try {
      const pool = new Pool({
        connectionString,
        ssl: connectionString.includes('sslmode=require')
          ? { rejectUnauthorized: false }
          : undefined,
      })
      await pool.query('SELECT 1')
      await pool.end()
      console.info('✅ database connection successful')
      return
    } catch (err) {
      const delay = Math.min(1000 * 1.5 ** i, 10000)
      console.info(
        `⏳ waiting for database... attempt ${i + 1}/${maxRetries} (retry in ${delay}ms)`,
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error('database connection timeout after ' + maxRetries + ' attempts')
}
