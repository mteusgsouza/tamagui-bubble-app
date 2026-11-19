import { loadEnv as vxrnLoadEnv } from 'vxrn/loadEnv'

import { getDockerHost } from './get-docker-host'

/**
 * O Criador dos testes: a conta que a migration `20260204022039_demo_user` cria, a mesma
 * do dev (`.env.development`). É quem o `loginAsDemo` usa e dono do que os seeds criam.
 *
 * 🔴 **Tem que chegar ao `bun run build`, não só ao servidor.** `MASTER_USER_ID` é
 * `process.env.VITE_MASTER_USER_ID` embutido no build, e o build de produção só lê
 * `.env`/`.env.production` — nenhum dos dois tem o id. Sem ele o feed procura posts do
 * dono `''`, o Criador não abre o admin, e os testes de feed e curso pulavam no CI mesmo
 * que houvesse dado.
 */
export const TEST_CREATOR_ID = 'demo-user-id'

/** o Postgres do `docker compose` (porta 5533) */
export const TEST_DATABASE_URL = 'postgresql://user:password@127.0.0.1:5533/postgres'

export async function getTestEnv() {
  // load development environment
  await vxrnLoadEnv('development')

  const dockerHost = getDockerHost()

  return {
    CI: 'true',
    DO_NOT_TRACK: '1',
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'test-secret',
    BETTER_AUTH_URL: 'http://localhost:8081',
    ONE_SERVER_URL: 'http://localhost:8081',
    POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN || 'test-token',
    VITE_DEMO_MODE: '1',
    // liga o botão "Entrar com a conta demo" (`demo-account.test.ts`)
    DEMO_LOGIN_ENABLED: '1',
    VITE_ZERO_HOSTNAME: '',
    VITE_WEB_HOSTNAME: '',
    DATABASE_URL: TEST_DATABASE_URL,
    VITE_MASTER_USER_ID: TEST_CREATOR_ID,
  }
}
