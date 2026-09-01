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

/**
 * Health check — e diagnóstico de configuração.
 *
 * ⚠️ **Esta rota não importa `env-server` nem `database` no topo, de propósito.** Ela
 * precisa responder mesmo quando a configuração está quebrada; é justamente aí que
 * serve. No primeiro deploy em produção todas as outras rotas devolviam 500 com
 * `FUNCTION_INVOCATION_FAILED` e nenhuma pista, enquanto esta respondia 200 — foi o que
 * mostrou que a falha era carga de módulo, não roteamento.
 *
 * `?diag=<CRON_SECRET>` importa os módulos do servidor dentro de `try/catch` e devolve a
 * mensagem do erro. Fica atrás do segredo porque mensagem de erro interna não é coisa
 * para expor a qualquer um.
 */
export const GET: Endpoint = async (request) => {
  const missing = REQUIRED.filter((name) => !process.env[name])

  // o app aceita qualquer um dos dois: `DATABASE_URL` é o nome que a integração
  // Neon↔Vercel injeta (ver `src/server/env-server.ts`)
  const hasDatabase = Boolean(process.env.ZERO_UPSTREAM_DB || process.env.DATABASE_URL)
  const ok = missing.length === 0 && hasDatabase

  const body: Record<string, unknown> = {
    status: ok ? 'ok' : 'config-incompleta',
    sha: process.env.GIT_SHA || 'dev',
    env: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
    config: {
      faltando: missing,
      banco: hasDatabase ? 'configurado' : 'AUSENTE (ZERO_UPSTREAM_DB ou DATABASE_URL)',
    },
  }

  const secret = process.env.CRON_SECRET
  if (secret && new URL(request.url).searchParams.get('diag') === secret) {
    body.diagnostico = {
      envServer: await probe(() => import('~/server/env-server')),
      database: await probe(() => import('~/database')),
      authServer: await probe(() => import('~/features/auth/server/authServer')),
    }
  }

  return Response.json(body, { status: ok ? 200 : 503 })
}

/** Importa um módulo e devolve `'ok'` ou a mensagem do erro, sem derrubar a rota. */
async function probe(load: () => Promise<unknown>) {
  try {
    await load()
    return 'ok'
  } catch (error) {
    return {
      erro: error instanceof Error ? error.message : String(error),
      tipo: error instanceof Error ? error.name : typeof error,
      // a primeira linha de stack costuma dizer qual require faltou
      origem: error instanceof Error ? error.stack?.split('\n')[1]?.trim() : undefined,
    }
  }
}
