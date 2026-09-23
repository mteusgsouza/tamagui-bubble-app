/**
 * Login Page Integration Test
 * Tests that the login page loads without freezing/infinite loops
 */

import { test, expect } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  // clear cookies and localStorage to simulate fresh user
  await context.clearCookies()
})

test('login page should load without freezing', async ({ page }) => {
  // set a reasonable timeout - if page freezes this will fail
  test.setTimeout(10000)

  // navigate to login page
  const response = await page.goto('http://localhost:8081/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 8000,
  })

  expect(response?.status()).toBe(200)

  // wait for content to appear (not just blank page)
  await expect(page.locator('body')).not.toBeEmpty()

  // check that the app container exists (uses display: contents so check attached, not visible)
  await expect(page.locator('[data-testid="app-container"]')).toBeAttached({
    timeout: 5000,
  })
})

test('login page shows login form elements', async ({ page }) => {
  test.setTimeout(15000)

  await page.goto('http://localhost:8081/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 10000,
  })

  // O botão de entrar por e-mail provando que a página renderizou inteira.
  //
  // ⚠️ **Por `data-testid`, não por texto.** A versão anterior procurava
  // "Continue with Email" e passou a falhar quando a Fase 10 traduziu a tela — sem que
  // ninguém notasse, porque a CI já estava vermelha pelo lint quebrado. Asserção em
  // texto de interface quebra a cada ajuste de cópia; o testid sobrevive.
  const emailButton = page.locator('[data-testid="go-to-login"]')
  await expect(emailButton).toBeVisible({ timeout: 10000 })
})

test('login page does not redirect infinitely', async ({ page }) => {
  test.setTimeout(15000)

  // track navigations to detect redirect loops
  const navigations: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      navigations.push(frame.url())
    }
  })

  await page.goto('http://localhost:8081/auth/login', {
    waitUntil: 'domcontentloaded',
    timeout: 10000,
  })

  // wait a bit to let any potential loops happen
  await page.waitForTimeout(2000)

  // filter to only login-related navigations
  const loginNavigations = navigations.filter(
    (url) => url.includes('/auth/login') || url.includes('/home'),
  )

  // allow up to 20 navigations (SPA may have initial load, SSR hydration, auth checks, etc)
  // this is mainly to catch infinite loops (which would be 100s or 1000s)
  expect(loginNavigations.length).toBeLessThanOrEqual(20)

  // should still be on /auth/login (not redirected away for logged-out user)
  expect(page.url()).toContain('/auth/login')
})
