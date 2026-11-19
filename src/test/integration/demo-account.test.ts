/**
 * A conta demo pública — o botão "Entrar com a conta demo" que fica ligado em produção
 * para quem testa sem cadastro (`~/features/auth/demoAccount.ts`).
 *
 * O que importa provar é o lado de fora do paywall: entrar, e continuar **sem** assinatura
 * e **sem** admin. Não é o `demo-login.test.ts`, que entra como o Criador.
 *
 * Exige `DEMO_LOGIN_ENABLED=1` no servidor — `scripts/helpers/get-test-env.ts` liga.
 * A asserção vai pelo `/api/me`, e não pelo texto do paywall no feed, porque o banco do CI
 * nasce só com as migrations: sem posts, não há cadeado para procurar.
 */

import { expect, test } from '@playwright/test'

const BASE_URL = 'http://localhost:8081'

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

test('conta demo entra e fica do lado de fora do paywall', async ({ page }) => {
  test.setTimeout(45000)

  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'domcontentloaded' })

  // o botão só aparece depois que o servidor responde `/demo-login/status`
  const button = page.locator('[data-testid="login-demo-account"]')
  await button.waitFor({ state: 'visible', timeout: 15000 })
  await button.click()

  await page.waitForURL((url) => !url.toString().includes('/auth/login'), {
    timeout: 30000,
  })
  expect(page.url()).toContain('/home/feed')

  const me = await page.request.get(`${BASE_URL}/api/me`)
  expect(me.status()).toBe(200)
  const body = (await me.json()) as {
    user: { isAdmin: boolean }
    subscription: unknown
  }
  expect(body.user.isAdmin).toBe(false)
  expect(body.subscription).toBeNull()
})

test('conta demo não abre checkout', async ({ page }) => {
  test.setTimeout(45000)

  await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-testid="login-demo-account"]').click({ timeout: 15000 })
  await page.waitForURL((url) => url.toString().includes('/home/feed'), {
    timeout: 30000,
  })

  // compartilhada por todos os testadores: um pagamento nela viraria assinatura de todos
  const res = await page.request.post(`${BASE_URL}/api/billing/checkout`, {
    data: { planId: 'plan-mensal' },
  })
  expect(res.status()).toBe(403)
  expect(((await res.json()) as { code: string }).code).toBe('demo-account')
})
