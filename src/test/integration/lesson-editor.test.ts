/**
 * Editor de aula: o criador abre a aula, sobe um arquivo e o player mostra.
 *
 * Depende do seed de cursos (`scripts/seed-courses.ts`) — sem a aula `aula-objecoes` os
 * testes pulam. O upload depende também do R2 configurado no servidor. Desfaz o que fez
 * (remove a mídia no fim), porque o banco é compartilhado.
 *
 * 🔴 **Espere o estado de "não encontrado" junto com o conteúdo, nunca só o conteúdo.** A
 * primeira versão esperava 20 s pelo botão de mídia e só *depois* checava se a aula
 * existia: no CI, onde o banco nasce só com as migrations, o teste estourava em vez de
 * pular — e com a nova tentativa do CI, levava junto o limite de tempo da suíte inteira.
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

  // sem R2 o arquivo não tem para onde ir: a rota responde 503 antes de ler o corpo (403
  // é a conta demo não ser o criador neste build — `VITE_MASTER_USER_ID`)
  const probe = await page.request.post(`${BASE_URL}/api/media/upload-url`, { data: {} })
  test.skip(probe.status() === 503, 'R2 não configurado neste ambiente')
  test.skip(probe.status() === 403, 'a conta demo não é o criador neste build')

  const add = page.locator('[data-testid="lesson-media-add"]')
  const replace = page.locator('[data-testid="lesson-media-replace"]')
  const notFound = page.getByText('Aula não encontrada')

  await expect(add.or(replace).or(notFound).first()).toBeVisible({ timeout: 20000 })
  test.skip(await notFound.isVisible(), 'banco sem a aula semeada')

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

  const lessons = page.locator('[data-testid="lesson-open"]')
  const titles = () => lessons.allInnerTexts()
  const notFound = page.getByText('Curso não encontrado')

  await expect(lessons.or(notFound).first()).toBeVisible({ timeout: 20000 })
  test.skip(await notFound.isVisible(), 'banco sem o curso semeado')

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
