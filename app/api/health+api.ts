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
 * ⚠️ **Esta rota não importa `env-server` nem `database` de propósito.** Ela precisa
 * responder mesmo quando a configuração está quebrada; é justamente aí que ela serve.
 * Foi assim que descobrimos, no primeiro deploy, que todas as outras rotas davam 500
 * enquanto esta devolvia 200: o problema era carga de módulo, não roteamento.
 *
 * Reporta só **nomes** de variáveis ausentes, nunca valores.
 */
export const GET: Endpoint = () => {
  const missing = REQUIRED.filter((name) => !process.env[name])

  // o app aceita qualquer um dos dois: `DATABASE_URL` é o nome que a integração
  // Neon↔Vercel injeta (ver `src/server/env-server.ts`)
  const hasDatabase = Boolean(process.env.ZERO_UPSTREAM_DB || process.env.DATABASE_URL)

  const ok = missing.length === 0 && hasDatabase

  return Response.json(
    {
      status: ok ? 'ok' : 'config-incompleta',
      sha: process.env.GIT_SHA || 'dev',
      env: process.env.NODE_ENV || 'unknown',
      timestamp: new Date().toISOString(),
      config: {
        faltando: missing,
        banco: hasDatabase ? 'configurado' : 'AUSENTE (ZERO_UPSTREAM_DB ou DATABASE_URL)',
      },
    },
    { status: ok ? 200 : 503 }
  )
}
