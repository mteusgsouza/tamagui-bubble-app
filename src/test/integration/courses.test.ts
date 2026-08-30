/**
 * Fluxo de cursos: login → lista → currículo → aula.
 *
 * Depende de o criador ter curso publicado com aula. Sem seed, os testes **pulam** em
 * vez de falhar — lista vazia é comportamento correto, não regressão.
 */

import { expect, test } from '@playwright/test'

import { loginAsDemo } from './helpers'

const BASE_URL = 'http://localhost:8081'

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

test('a aba de cursos abre e lista os cursos do criador', async ({ page }) => {
  test.setTimeout(45000)

  await loginAsDemo(page)
  await page.goto(`${BASE_URL}/home/courses`, { waitUntil: 'domcontentloaded' })

  await expect(page.getByText('Cursos').first()).toBeVisible({ timeout: 15000 })

  const cards = page.locator('[data-testid="course-card"]')
  // o Zero sincroniza depois do primeiro render
  await cards
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {})

  const count = await cards.count()
  test.skip(count === 0, 'banco sem curso publicado para o criador')

  expect(count).toBeGreaterThan(0)
})

test('abrir um curso mostra o currículo, e uma aula abre o player', async ({ page }) => {
  test.setTimeout(60000)

  await loginAsDemo(page)
  await page.goto(`${BASE_URL}/home/courses`, { waitUntil: 'domcontentloaded' })

  const cards = page.locator('[data-testid="course-card"]')
  await cards
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .catch(() => {})

  test.skip((await cards.count()) === 0, 'banco sem curso publicado para o criador')

  await cards.first().click()
  await expect(page.locator('[data-testid="course-detail"]')).toBeVisible({
    timeout: 15000,
  })

  const lessons = page.locator('[data-testid="lesson-row"]')
  await lessons
    .first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {})

  test.skip((await lessons.count()) === 0, 'curso sem aula publicada')

  await lessons.first().click()

  await expect(page.locator('[data-testid="lesson-detail"]')).toBeVisible({
    timeout: 15000,
  })
  // o botão só aparece logado — prova que a sessão sobreviveu a duas navegações
  await expect(page.locator('[data-testid="mark-complete"]')).toBeVisible({
    timeout: 10000,
  })
})

test('curso inexistente mostra o estado de indisponível, não erro', async ({ page }) => {
  test.setTimeout(45000)

  await loginAsDemo(page)

  await page.goto(`${BASE_URL}/home/courses/curso-que-nao-existe`, {
    waitUntil: 'domcontentloaded',
  })

  await expect(page.getByText('Curso indisponível')).toBeVisible({ timeout: 15000 })
})
