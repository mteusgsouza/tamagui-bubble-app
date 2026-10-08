#!/usr/bin/env bun

/**
 * @description Empacota o JS de release do Android e compila com o Hermes, como o Gradle faz
 */

/**
 * Reproduz o `:app:createBundleReleaseJsAndAssets` fora do Gradle: o bundle de release
 * pelo vxrn e depois o `hermesc`. É o passo que mais quebra no build nativo, e aqui ele
 * leva ~2 min — no EAS são 30, mais a fila.
 *
 * Pega a classe de erro que derrubou o build de 07/09/2026: um `import()` dinâmico de
 * pacote não instalado (`expo-network`, pedido pelo `@better-auth/expo`). O rolldown
 * deixa o `import()` cru e só avisa; quem recusa é o Hermes, no fim.
 *
 * Roda da WSL: os binários nativos do `node_modules` (rolldown, hermesc) são de Linux.
 *
 * ⚠️ **As variáveis vêm do `eas.json` → `release-base`, e são passadas à força.** O bun
 * carrega o `.env.development` sozinho, e o `localhost` e o `demo-user-id` de lá
 * vazariam para o bundle — exatamente o defeito que esta checagem existe para pegar.
 */

import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

const eas = JSON.parse(readFileSync('eas.json', 'utf8'))
const releaseEnv: Record<string, string> = eas.build['release-base'].env

const out = join(tmpdir(), 'bubble-native-bundle')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'res'), { recursive: true })

const bundle = join(out, 'index.android.bundle')
const env = { ...process.env, ...releaseEnv, APP_VARIANT: 'preview', NODE_ENV: 'production' }

console.info(`servidor: ${releaseEnv.ONE_SERVER_URL}`)
console.info('== bundle (vxrn) ==')
const bundled = await $`node node_modules/react-native/cli.js bundle --platform android --dev false --reset-cache --entry-file index.js --bundle-output ${bundle} --assets-dest ${join(out, 'res')}`
  .env(env)
  .nothrow()
  .quiet()

// o log do rolldown vem colorido
const log = `${bundled.stdout}${bundled.stderr}`.replace(/\x1b\[[0-9;]*m/g, '')
if (bundled.exitCode !== 0) {
  console.error(log.slice(-4000))
  process.exit(1)
}

const problems: string[] = []

// Módulo não resolvido vira "externo": `import()` cru (o Hermes recusa) ou `require` que
// estoura só no aparelho. Os dois são defeito, mesmo que o bundle saia.
const unresolved = [...log.matchAll(/Could not resolve '([^']+)' in (\S+)/g)]
for (const [, mod, from] of unresolved) {
  problems.push(`módulo não resolvido: '${mod}' (pedido por ${from})`)
}

// Sem isto o `getURL()` do One devolve o marcador e o app para ao abrir
// (`src/constants/urls.ts`).
const code = readFileSync(bundle, 'utf8')
if (!code.includes(`process.env.ONE_SERVER_URL = ${JSON.stringify(releaseEnv.ONE_SERVER_URL)}`)) {
  problems.push('ONE_SERVER_URL não foi gravada no prelúdio do bundle')
}
if (!code.includes(releaseEnv.VITE_MASTER_USER_ID)) {
  problems.push('VITE_MASTER_USER_ID não chegou ao bundle: o feed abriria vazio')
}

console.info(`bundle: ${(code.length / 1024 / 1024).toFixed(1)} MB`)

console.info('== hermesc ==')
const hermesBin = {
  linux: 'linux64-bin',
  darwin: 'osx-bin',
  win32: 'win64-bin',
}[process.platform as 'linux' | 'darwin' | 'win32']
const compiled =
  await $`node_modules/hermes-compiler/hermesc/${hermesBin}/hermesc -w -emit-binary -max-diagnostic-width=80 -O -out ${bundle}.hbc ${bundle}`
    .nothrow()
    .quiet()
if (compiled.exitCode !== 0) {
  problems.push(`hermesc recusou o bundle:\n${`${compiled.stdout}${compiled.stderr}`.slice(0, 3000)}`)
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} problema(s):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}

console.info('✓ bundle de release compila no Hermes, com o servidor e o criador de produção')
