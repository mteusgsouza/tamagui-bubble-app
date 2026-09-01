import type { Endpoint } from 'one'

/**
 * As variáveis sem valor padrão: faltando qualquer uma, o `ensureEnv` de
 * `~/server/env-server` **lança**, e a rota inteira devolve 500 antes de executar uma
 * linha sequer da própria lógica.
 */
const REQUIRED = [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'ONE_SERVER_URL',
  'ZERO_VERSION',
] as const

/** Cada sonda tem prazo. Sem isto a rota trava junto com o que está diagnosticando. */
const PROBE_TIMEOUT_MS = 4_000

/**
 * Health check — e diagnóstico de configuração.
 *
 * ⚠️ **O topo deste arquivo não importa `env-server`, `database` nem `pg`, de propósito.**
 * A rota precisa responder justamente quando esses módulos quebram. No primeiro deploy em
 * produção todas as outras rotas devolviam 500 `FUNCTION_INVOCATION_FAILED` sem corpo,
 * enquanto esta respondia 200 — foi o que mostrou que a falha era carga de módulo.
 *
 * `?diag=<CRON_SECRET>` carrega os módulos do servidor e pinga o banco, cada coisa com
 * prazo próprio, e devolve o erro de cada um. Atrás do segredo porque mensagem de erro
 * interna não é para expor.
 */
export const GET: Endpoint = async (request) => {
  const missing = REQUIRED.filter((name) => !process.env[name])

  // o app aceita qualquer um dos dois: `DATABASE_URL` é o nome que a integração
  // Neon↔Vercel injeta (ver `src/server/env-server.ts`)
  const dbUrl = process.env.ZERO_UPSTREAM_DB || process.env.DATABASE_URL || ''
  const ok = missing.length === 0 && Boolean(dbUrl)

  const body: Record<string, unknown> = {
    status: ok ? 'ok' : 'config-incompleta',
    sha: process.env.GIT_SHA || 'dev',
    env: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
    config: {
      faltando: missing,
      banco: dbUrl ? 'configurado' : 'AUSENTE (ZERO_UPSTREAM_DB ou DATABASE_URL)',
      // sem expor credencial: só o formato, que é onde mora a confusão pooler/direto
      bancoHost: hostOf(dbUrl),
      bancoPooler: dbUrl.includes('-pooler') ? 'sim (certo para a Vercel)' : 'não',
    },
  }

  const secret = process.env.CRON_SECRET
  if (secret && new URL(request.url).searchParams.get('diag') === secret) {
    // em paralelo: sequencial estouraria o limite de duração da função
    const [envServer, database, authServer, ping] = await Promise.all([
      probe('envServer', () => import('~/server/env-server')),
      probe('database', () => import('~/database')),
      probe('authServer', () => import('~/features/auth/server/authServer')),
      probe('pingBanco', () => pingDatabase(dbUrl)),
    ])
    body.diagnostico = { envServer, database, authServer, ping }
  }

  return Response.json(body, { status: ok ? 200 : 503 })
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host
  } catch {
    return url ? '(url ilegível)' : '(vazia)'
  }
}

/** Conecta de verdade e roda `SELECT 1` — é o que separa "configurado" de "alcançável". */
async function pingDatabase(url: string) {
  if (!url) throw new Error('sem URL de banco')
  const { Client } = await import('pg')
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 3_000,
    ssl: url.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
  })
  try {
    await client.connect()
    const { rows } = await client.query('select current_database() as db')
    return `ok (${rows[0]?.db})`
  } finally {
    await client.end().catch(() => {})
  }
}

/** Roda algo com prazo e devolve `'ok'`, o valor, ou a descrição do erro. */
async function probe(name: string, run: () => Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`travou: passou de ${PROBE_TIMEOUT_MS}ms sem responder`)),
          PROBE_TIMEOUT_MS
        )
      }),
    ])
    return typeof result === 'string' ? result : 'ok'
  } catch (error) {
    return {
      onde: name,
      erro: error instanceof Error ? error.message : String(error),
      tipo: error instanceof Error ? error.name : typeof error,
      origem: error instanceof Error ? error.stack?.split('\n')[1]?.trim() : undefined,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
