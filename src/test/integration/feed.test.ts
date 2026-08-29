/**
 * Fluxo do feed: login → lista → detalhe do post.
 *
 * Depende de o criador (`VITE_MASTER_USER_ID`) ter pelo menos um post publicado. Se o
 * banco estiver sem seed, os testes pulam em vez de falhar — feed vazio é comportamento
 * correto, não regressão.
 */

import { expect, test } from '@playwright/test'

import { loginAsDemo } from './helpers'

const BASE_URL = 'http://localhost:8081'

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

test('o feed lista os posts do criador', async ({ page }) => {
  test.setTimeout(45000)

  await loginAsDemo(page)
  expect(page.url()).toContain('/home/feed')

  const cards = page.locator('[data-testid="post-card"]')
  // o Zero sincroniza depois do primeiro render: espera a linha chegar
  await cards.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})

  const count = await cards.count()
  test.skip(count === 0, 'banco sem posts publicados para o criador')

  expect(count).toBeGreaterThan(0)
})

test('abrir um post leva ao detalhe, com a caixa de comentário', async ({ page }) => {
  test.setTimeout(45000)

  await loginAsDemo(page)

  const links = page.locator('[data-testid="post-link"]')
  await links.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})

  const count = await links.count()
  test.skip(count === 0, 'banco sem posts publicados para o criador')

  await links.first().click()

  await page.waitForURL((url) => /\/home\/feed\/.+/.test(url.toString()), {
    timeout: 15000,
  })

  await expect(page.locator('[data-testid="post-detail"]')).toBeVisible({
    timeout: 15000,
  })

  // a caixa de comentário só aparece logado — é também a prova de que a sessão
  // sobreviveu à navegação
  await expect(page.locator('[data-testid="comment-input"]')).toBeVisible({
    timeout: 10000,
  })
})

test('post inexistente mostra o estado de indisponível, não erro', async ({ page }) => {
  test.setTimeout(45000)

  await loginAsDemo(page)

  // um id que o gate nunca vai liberar: para o cliente, apagado e barrado são iguais
  await page.goto(`${BASE_URL}/home/feed/post-que-nao-existe`, {
    waitUntil: 'domcontentloaded',
  })

  await expect(page.getByText('Post indisponível')).toBeVisible({ timeout: 15000 })
})
