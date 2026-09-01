import { describe, expect, it } from 'vitest'

import { APP_VERSION } from '~/constants/app'

import pkg from '../../../package.json'

/**
 * A versão vive em dois lugares por necessidade, não por descuido:
 *
 * - `package.json` — de onde o `app.config.ts` lê, com `require` de JSON. Ele **não pode**
 *   importar de `src/`: o carregador de config do Expo resolve em CJS puro e quebra o
 *   `expo config` inteiro, derrubando o build nativo junto.
 * - `src/constants/app.ts` — de onde a tela de Perfil lê.
 *
 * Este teste é o que impede os dois de divergirem. Antes de existir, três lugares
 * guardavam a versão e o app dizia 0.0.1 enquanto a tela mostrava v1.0.0.
 */
describe('versão do app', () => {
  it('APP_VERSION bate com a do package.json', () => {
    expect(APP_VERSION).toBe(pkg.version)
  })

  it('é semver', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
