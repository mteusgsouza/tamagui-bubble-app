import { loadEnv as vxrnLoadEnv } from 'vxrn/loadEnv'

import { getDockerHost } from './get-docker-host'

export async function getTestEnv() {
  // load development environment
  await vxrnLoadEnv('development')

  const dockerHost = getDockerHost()
  const dockerDbBase = `postgresql://user:password@127.0.0.1:5533`

  return {
    CI: 'true',
    DO_NOT_TRACK: '1',
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'test-secret',
    BETTER_AUTH_URL: 'http://localhost:8081',
    ONE_SERVER_URL: 'http://localhost:8081',
    POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN || 'test-token',
    VITE_DEMO_MODE: '1',
    VITE_ZERO_HOSTNAME: '',
    VITE_WEB_HOSTNAME: '',
    DATABASE_URL: `${dockerDbBase}/postgres`,
  }
}
