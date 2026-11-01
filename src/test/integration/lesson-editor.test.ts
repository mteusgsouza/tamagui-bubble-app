/**
 * Editor de aula: o criador abre a aula, sobe um arquivo e o player mostra.
 *
 * Depende do seed de cursos (`scripts/seed-courses.ts`) — sem a aula `aula-objecoes` os
 * testes pulam. Desfaz o que fez (remove a mídia no fim), porque o banco é compartilhado.
 */

import { expect, test } from '@playwright/test'

import { loginAsDemo } from './helpers'

const BASE_URL = 'http://localhost:8081'

// PNG 1×1: o seletor da aula aceita foto, vídeo e áudio, e o arquivo menor sobe mais rápido
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.beforeEach(async ({ context }) => {
  await context.clearCookies()
})

test('subir um arquivo na aula liga a mídia e o editor passa a mostrá-la', async ({
  page,
}) => {
  test.setTimeout(90000)

  await loginAsDemo(page, '/admin/lessons/aula-objecoes')

  const add = page.locator('[data-testid="lesson-media-add"]')
  const replace = page.locator('[data-testid="lesson-media-replace"]')

  await expect(add.or(replace)).toBeVisible({ timeout: 20000 })
  test.skip(
    (await page.getByText('Aula não encontrada').count()) > 0,
    'banco sem a aula semeada',
  )

  // o seletor é um `<input type="file">` criado na hora: o Playwright o enxerga como
  // `filechooser`
  if (await add.isVisible()) {
    const chooser = page.waitForEvent('filechooser')
    await add.click()
    await (
      await chooser
    ).setFiles({ name: 'aula.png', mimeType: 'image/png', buffer: PNG_1X1 })
  }

  await expect(replace).toBeVisible({ timeout: 45000 })

  // desfaz: volta ao estado do seed
  await page.locator('[data-testid="lesson-media-remove"]').click()
  await expect(add).toBeVisible({ timeout: 15000 })
})

test('as setas reordenam sem buraco e a primeira aula não sobe', async ({ page }) => {
  test.setTimeout(60000)

  await loginAsDemo(page, '/admin/courses/curso-aquisicao')

  const titles = () => page.locator('[data-testid="lesson-open"]').allInnerTexts()
  await expect(page.locator('[data-testid="lesson-open"]').first()).toBeVisible({
    timeout: 20000,
  })

  const before = await titles()
  test.skip(before.length < 2, 'curso sem aulas suficientes')

  // a primeira aula do primeiro módulo está desabilitada para subir
  await expect(page.locator('[data-testid="lesson-up"]').first()).toHaveAttribute(
    'aria-disabled',
    'true',
  )

  // desce a primeira e confere a troca; depois sobe de volta
  await page.locator('[data-testid="lesson-down"]').first().click()
  await expect.poll(async () => (await titles())[1]).toBe(before[0])

  await page.locator('[data-testid="lesson-up"]').nth(1).click()
  await expect.poll(titles).toEqual(before)
})
