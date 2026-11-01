#!/usr/bin/env bun

/**
 * @description Cria (e alinha) as contas de teste do ambiente local.
 *
 *   bun dev                                   # o servidor precisa estar no ar
 *   bun run:dev scripts/seed-dev-accounts.ts
 *
 * Idempotente: rodar de novo não duplica nada e reconverge o que estiver fora do lugar
 * (role, assinatura). As contas e as senhas estão em `src/constants/devAccounts.ts`, que
 * é o mesmo arquivo que o atalho da tela de login lê — uma lista só, senão o botão
 * promete uma conta que o banco não tem.
 *
 * 🔴 **O cadastro passa pelo servidor, não pelo Postgres.** A senha do Better Auth é um
 * hash scrypt com parâmetros que só ele conhece; `INSERT` direto em `account` geraria uma
 * conta que **não entra**. Então o script fala com `/api/auth/sign-up/email` e só depois
 * encosta no banco, para o que a API não faz: `role = 'admin'` e a assinatura ativa.
 *
 * ⚠️ Recusa rodar fora de desenvolvimento. Estas senhas são descartáveis e não têm o que
 * fazer em outro banco.
 */

import { Pool } from 'pg'

import { DEV_ACCOUNTS } from '../src/constants/devAccounts'

const DB = process.env.DATABASE_URL
const BASE = process.env.ONE_SERVER_URL || 'http://localhost:8081'
const CREATOR = process.env.VITE_MASTER_USER_ID || 'demo-user-id'

if (process.env.NODE_ENV === 'production') {
  console.error('❌ Contas de teste não se semeiam em produção.')
  process.exit(1)
}

if (!DB) {
  console.error('❌ DATABASE_URL não está no ambiente.')
  console.error('   Use: bun run:dev scripts/seed-dev-accounts.ts')
  process.exit(1)
}

const pool = new Pool({ connectionString: DB })

/**
 * Cadastra pelo servidor.
 *
 * E-mail repetido volta 422 e **não é erro** aqui: é o caso normal da segunda execução.
 * `apiHandler.ts` ainda intercepta esse 422 e cai para sign-in, então a resposta pode vir
 * 200 — as duas são sucesso para este script.
 */
async function signUp(account: (typeof DEV_ACCOUNTS)[number]) {
  const response = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: account.name,
      email: account.email,
      password: account.password,
    }),
  })

  if (response.ok || response.status === 422) return 'ok'

  const detail = await response.text()
  return `falhou (${response.status}): ${detail.slice(0, 160)}`
}

async function main() {
  // o servidor precisa estar no ar: o cadastro é dele, não do banco
  try {
    const health = await fetch(`${BASE}/api/health`)
    if (!health.ok) throw new Error(String(health.status))
  } catch {
    console.error(`❌ O servidor não respondeu em ${BASE}.`)
    console.error('   Suba com `bun dev` e rode este script de novo.')
    process.exit(1)
  }

  for (const account of DEV_ACCOUNTS) {
    const result = await signUp(account)
    if (result !== 'ok') {
      console.error(`❌ ${account.email}: ${result}`)
      continue
    }

    const { rows } = await pool.query<{ id: string }>(
      'select id from "user" where email = $1 limit 1',
      [account.email],
    )
    const userId = rows[0]?.id
    if (!userId) {
      console.error(`❌ ${account.email}: cadastrou mas não achei a linha.`)
      continue
    }

    await pool.query('update "user" set role = $2 where id = $1', [userId, account.role])

    // `userPublic` nasce pelo hook `afterCreateUser`; conferimos porque **toda** FK de
    // conteúdo aponta para lá, e conta sem essa linha não recebe assinatura
    await pool.query(
      `insert into "userPublic" (id, name) values ($1, $2) on conflict (id) do nothing`,
      [userId, account.name],
    )

    if (account.plan) {
      // uma assinatura por (usuário, criador), como `grantSubscription` faz
      await pool.query(
        `insert into subscription (id, "userId", "creatorId", "planId", provider, status, "currentPeriodEnd")
         values ($1, $2, $3, $4, 'manual', 'active', now() + interval '365 days')
         on conflict (id) do update
           set "planId" = excluded."planId",
               status = 'active',
               "currentPeriodEnd" = excluded."currentPeriodEnd",
               "cancelAtPeriodEnd" = false,
               "updatedAt" = now()`,
        [`dev-sub-${userId}`, userId, CREATOR, account.plan],
      )
    }

    const extras = [
      account.role === 'admin' ? 'role=admin' : null,
      account.plan ? `assina ${account.plan}` : null,
    ].filter(Boolean)

    console.info(`✅ ${account.email}${extras.length ? ` · ${extras.join(' · ')}` : ''}`)
  }

  await pool.end()
  console.info('\nPronto. O atalho na tela de login usa exatamente estas contas.')
}

main().catch(async (error: unknown) => {
  console.error('❌ Falhou:', error)
  await pool.end()
  process.exit(1)
})
