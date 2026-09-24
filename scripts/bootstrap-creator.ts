#!/usr/bin/env bun

/**
 * @description Cria a conta do criador num banco vazio, com um id **escolhido**.
 *
 *   bun run:dev scripts/bootstrap-creator.ts --email x@y.com --password SENHA
 *   ... --id <VITE_MASTER_USER_ID> --url https://bubble.mateusgsouza.com.br
 *
 * ⚠️ **Por que isto existe.** `VITE_MASTER_USER_ID` é embutido no build: é o valor de
 * `post.feedOwnerId` e `subscription.creatorId`, e a tela lê dele. Num banco novo esse
 * id não existe, e `seed-posts.ts` aborta — mas um cadastro normal gera id aleatório, e
 * trocá-lo depois esbarra nas FKs de `account`, `session` e `userPublic`.
 *
 * A saída é inserir as linhas **já com o id certo**. O problema é a senha: o hash é
 * scrypt do Better Auth e não dá para forjar. Então o script cadastra uma conta
 * descartável pela API real, **empresta o hash dela** (o formato é `salt:hash`, sem
 * vínculo com o usuário) e apaga a descartável.
 *
 * Alternativa que não foi tomada: reconstruir a imagem com um `VITE_MASTER_USER_ID` novo.
 * Funciona, mas custa um build de ~5 min a cada banco recriado, e deixa o id de produção
 * divergente do que está versionado.
 */

import { Pool } from 'pg'

const DB = process.env.DATABASE_URL

type Args = { email?: string; password?: string; id?: string; url?: string }

const args: Args = {}
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i += 2) {
  const chave = argv[i]?.replace(/^--/, '') as keyof Args
  if (chave) args[chave] = argv[i + 1]
}

const EMAIL = args.email
const PASSWORD = args.password
const ID = args.id || process.env.VITE_MASTER_USER_ID
const URL_BASE = args.url || 'http://localhost:8081'

if (!DB) {
  console.error('❌ DATABASE_URL não está no ambiente.')
  process.exit(1)
}
if (!EMAIL || !PASSWORD || !ID) {
  console.error('❌ uso: --email <e-mail> --password <senha> [--id <id>] [--url <base>]')
  console.error('   o id cai em VITE_MASTER_USER_ID quando não é passado.')
  process.exit(1)
}

const pool = new Pool({ connectionString: DB })
const agora = () => new Date().toISOString()

/** Cadastra uma conta descartável só para o Better Auth produzir um hash válido. */
async function hashEmprestado(): Promise<string> {
  const descartavel = `bootstrap-${crypto.randomUUID()}@bootstrap.local`

  const resposta = await fetch(`${URL_BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: descartavel, password: PASSWORD, name: 'bootstrap' }),
  })
  if (!resposta.ok) {
    throw new Error(`cadastro descartável falhou: ${resposta.status} ${await resposta.text()}`)
  }

  const { rows } = await pool.query<{ password: string; userId: string }>(
    `SELECT a.password, a."userId" FROM account a
       JOIN "user" u ON u.id = a."userId"
      WHERE u.email = $1 AND a."providerId" = 'credential'
      LIMIT 1`,
    [descartavel],
  )
  const hash = rows[0]?.password
  if (!hash) throw new Error('a conta descartável nasceu sem hash de senha')

  // some com ela; `account`, `session` e `userPublic` caem por cascade
  await pool.query('DELETE FROM "user" WHERE email = $1', [descartavel])
  return hash
}

async function main() {
  const [existente] = (
    await pool.query<{ id: string }>('SELECT id FROM "user" WHERE id = $1', [ID])
  ).rows
  if (existente) {
    console.info(`ℹ️  o usuário ${ID} já existe — nada a fazer.`)
    return
  }

  const hash = await hashEmprestado()
  const quando = agora()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `INSERT INTO "user" (id, name, email, "normalizedEmail", "emailVerified",
                           role, banned, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, true, 'admin', false, $5, $5)`,
      [ID, 'Criador', EMAIL, EMAIL!.toLowerCase(), quando],
    )

    await client.query(
      `INSERT INTO account (id, "accountId", "providerId", "userId", password,
                            "createdAt", "updatedAt")
       VALUES ($1, $2, 'credential', $2, $3, $4, $4)`,
      [crypto.randomUUID(), ID, hash, quando],
    )

    // o hook `afterCreateUser` não roda aqui — a linha é criada à mão
    await client.query(
      `INSERT INTO "userPublic" (id, name, "joinedAt") VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING`,
      [ID, 'Criador', quando],
    )

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  console.info(`✅ criador ${ID} criado`)
  console.info(`   e-mail: ${EMAIL} · role: admin`)
  console.info('   a senha é a que você passou — troque-a se este for um ambiente público.')
}

try {
  await main()
} catch (error) {
  console.error('❌ bootstrap falhou:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
