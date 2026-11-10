/**
 * Página pública do certificado, **sem sessão**.
 *
 * É o único jeito de provar que `/certificado/<code>` está fora do guard de `(app)`:
 * logado o defeito não aparece. Um código inexistente basta — o que se verifica é que a
 * página carrega na própria URL e responde "não encontrado", em vez de mandar para o login.
 */

import { expect, test } from '@playwright/test'

const BASE_URL = 'http://localhost:8081'

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

test('o certificado público abre sem login e não redireciona', async ({ page }) => {
  test.setTimeout(30000)

  await page.goto(`${BASE_URL}/certificado/ZZZZZZZZZZ`, { waitUntil: 'domcontentloaded' })

  await expect(page.locator('[data-testid="certificate-missing"]')).toBeVisible({
    timeout: 15000,
  })
  expect(new URL(page.url()).pathname).toBe('/certificado/ZZZZZZZZZZ')
})

test('a API pública responde sem sessão e não vaza dado interno', async ({ request }) => {
  const missing = await request.get(`${BASE_URL}/api/certificate/ZZZZZZZZZZ`)
  expect(missing.status()).toBe(404)

  const malformed = await request.get(`${BASE_URL}/api/certificate/abc`)
  expect(malformed.status()).toBe(404)
})
