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

type ReleaseEnv = { ONE_SERVER_URL: string; VITE_MASTER_USER_ID: string }

const eas = JSON.parse(readFileSync('eas.json', 'utf8'))
const releaseEnv: ReleaseEnv = eas.build['release-base'].env

const out = join(tmpdir(), 'bubble-native-bundle')
rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'res'), { recursive: true })

const bundle = join(out, 'index.android.bundle')
// Sem `NODE_ENV`, como no EAS (o log de lá avisa que ela não foi definida): é o vxrn que a
// põe em `production`, e só depois de resolver o config do Vite.
const env: Record<string, string | undefined> = {
  ...process.env,
  ...releaseEnv,
  APP_VARIANT: 'preview',
}
delete env.NODE_ENV

console.info(`servidor: ${releaseEnv.ONE_SERVER_URL}`)
console.info('== bundle (vxrn) ==')

const problems: string[] = []

// Como o Gradle: a tarefa só fecha quando a saída do comando fecha (EOF), não quando o
// node sai. Processo filho órfão que herda o stderr segura a saída aberta, e o EAS corta
// o build no teto de 45 min marcando *Canceled* — foi o observador do Tamagui nos builds
// `125ca5b1` e `960bb1f4` (ver `tamagui.build.ts`).
//
// ⚠️ **Os argumentos são os do `BundleHermesCTask` do RN 0.83, de propósito.** O defeito é
// uma corrida — o observador nasce durante o bundle — e sem o `--sourcemap-output` o bundle
// termina antes dele: a checagem passava com o observador religado. Com os argumentos do
// Gradle, o mesmo defeito prendia a saída por 10 min na WSL.
const PIPE_GRACE_MS = 15_000
const proc = Bun.spawn(
  [
    'node',
    'node_modules/react-native/cli.js',
    'bundle',
    ...['--platform', 'android', '--dev', 'false', '--reset-cache'],
    ...['--entry-file', 'index.js', '--bundle-output', bundle],
    ...['--assets-dest', join(out, 'res')],
    ...['--sourcemap-output', `${bundle}.packager.map`],
    ...['--minify', 'false', '--verbose'],
  ],
  { env, stdout: 'pipe', stderr: 'pipe' },
)
const output = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
const exitCode = await proc.exited
const closed = await Promise.race([output, Bun.sleep(PIPE_GRACE_MS).then(() => null)])

let log = ''
if (closed === null) {
  problems.push(
    `a saída do bundle continuou aberta ${PIPE_GRACE_MS / 1000} s depois do node sair: um processo filho órfão a segura e o Gradle esperaria para sempre`,
  )
} else {
  // o log do rolldown vem colorido
  log = closed.join('').replace(/\x1b\[[0-9;]*m/g, '')
}
if (exitCode !== 0) {
  console.error(log.slice(-4000))
  process.exit(1)
}

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

// As duas abaixo dependem do `react-native.config.cjs` passar a configuração do One ao
// vxrn. Sem ela o APK compila e fica parado no splash — foi o build `a3ecc4c1`.
if (!code.includes('[native] start')) {
  problems.push('o setupNative.ts não entrou no bundle (MMKV da sessão, setups do Tamagui)')
}
const rawWorklets = code.match(/^\s*["']worklet["'];/gm)?.length ?? 0
if (rawWorklets) {
  problems.push(
    `${rawWorklets} funções "worklet" sem transformar: o plugin do Reanimated não rodou e o primeiro componente animado quebra no render`,
  )
}

console.info(`bundle: ${(code.length / 1024 / 1024).toFixed(1)} MB`)

console.info('== hermesc ==')
const hermesBin = {
  linux: 'linux64-bin',
  darwin: 'osx-bin',
  win32: 'win64-bin',
}[process.platform as 'linux' | 'darwin' | 'win32']
const compiled =
  await $`node_modules/hermes-compiler/hermesc/${hermesBin}/hermesc -w -emit-binary -max-diagnostic-width=80 -out ${bundle}.hbc ${bundle} -O -output-source-map`
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
