/**
 * Comandos do React Native CLI. É por aqui que o build nativo empacota o JS: o Gradle
 * (`:app:createBundleReleaseJsAndAssets`) chama `react-native bundle`, e o vxrn
 * registra o `bundle` dele no lugar do Metro.
 *
 * 🔴 **Sem o embrulho abaixo, o APK não passa do splash.** O compilador do vxrn nasce com
 * `enableReanimated: false`, e quem o liga é o One — depois de varrer as dependências no
 * dev server, coisa que o build de release nunca faz. Saíam no bundle 513 funções
 * `"worklet"` sem transformar, inclusive as do runtime do `react-native-worklets` e do
 * `@tamagui/animations-reanimated`; o Reanimated 4 não funciona assim. O splash do Expo
 * segura o desenho da tela até o primeiro conteúdo do React, então o erro ficava escondido
 * atrás dele para sempre.
 *
 * ⚠️ **O vxrn (1.25.16) e o One (1.14.2) estão em versões diferentes** desde o 630f04d, e o
 * vxrn traz a própria cópia do `@vxrn/compiler`. Configurar a cópia do One não adianta:
 * tem que ser a instância que o vxrn importa — por isso a resolução a partir do diretório
 * dele, e pelo `realpath`, que é como o Node identifica o módulo ESM.
 *
 * ℹ️ O resto da configuração do One chega sozinho: o `bundle` do vxrn chama o
 * `resolveConfig` do Vite (para ver se o projeto usa Metro), e isso roda a função `one()`
 * do `vite.config.ts`, que grava o `setupFile`. O `setupNative.ts` sumia do bundle por
 * outro motivo — o `sideEffects` do `package.json` (invariante 13).
 *
 * 🔴 **O `BUBBLE_NATIVE_BUNDLE` desliga o observador do `tamagui.build.ts`.** O mesmo
 * `resolveConfig` constrói o plugin do Tamagui, que abre um serviço do esbuild para
 * observar o config e só o fecha num hook (`buildEnd`) que este caminho nunca chama. O
 * serviço ficava órfão segurando o pipe do Gradle, e o EAS cortava o build no teto de
 * 45 min (`125ca5b1`, `960bb1f4`). Reproduzido na WSL com os três comandos do
 * `BundleHermesCTask`: o pipe só fechou quando o esbuild órfão foi morto.
 *
 * Não carregue o `vite.config.ts` aqui: o vxrn já o resolve, e um segundo carregamento
 * cria um segundo plugin do Tamagui.
 *
 * `bun check native-bundle` confere o resultado no bundle gerado.
 */

const { execFileSync } = require('node:child_process')
const { realpathSync } = require('node:fs')
const { dirname, join } = require('node:path')
const { pathToFileURL } = require('node:url')

const vxrnCommands = require('vxrn/react-native-commands')

/**
 * Rede de segurança: nenhum processo filho sobrevive ao `bundle`.
 *
 * O observador do Tamagui foi o culpado conhecido, mas o defeito é uma **corrida** — na
 * WSL travou 1 vez em 4, no EAS nas 2 tentativas — e qualquer ferramenta que suba um
 * serviço em processo filho (o esbuild faz isso por padrão) pode repeti-lo. Na saída, os
 * filhos diretos recebem SIGTERM; sem eles, nada mais segura o pipe que o Gradle lê.
 */
function killChildrenOnExit() {
  if (process.platform === 'win32') return
  process.on('exit', () => {
    try {
      const children = execFileSync('pgrep', ['-P', String(process.pid)], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)
      if (!children.length) return
      console.info(`[react-native.config] encerrando ${children.length} processo(s) filho(s)`)
      execFileSync('pkill', ['-TERM', '-P', String(process.pid)], { stdio: 'ignore' })
    } catch {
      // `pgrep`/`pkill` saem com 1 quando não acham ninguém
    }
  })
}

async function enableReanimatedInVxrnCompiler(root) {
  const resolveFrom = (dir, request) => require.resolve(request, { paths: [dir] })

  try {
    resolveFrom(root, 'react-native-worklets/plugin')
  } catch {
    return // sem Reanimated no projeto, nada a transformar
  }

  const vxrnDir = dirname(resolveFrom(root, 'vxrn/package.json'))
  const compilerPkgPath = resolveFrom(vxrnDir, '@vxrn/compiler/package.json')
  const compilerEntry = join(dirname(compilerPkgPath), require(compilerPkgPath).exports['.'].import)
  const compiler = await import(pathToFileURL(realpathSync(compilerEntry)).href)
  compiler.configureVXRNCompilerPlugin({ enableReanimated: true })
}

module.exports = {
  commands: vxrnCommands.map((command) =>
    command.name !== 'bundle'
      ? command
      : {
          ...command,
          func: async (argv, ctx, args) => {
            // antes do `command.func`: o plugin do Tamagui nasce dentro dele
            process.env.BUBBLE_NATIVE_BUNDLE = '1'
            killChildrenOnExit()
            await enableReanimatedInVxrnCompiler(ctx.root)
            return command.func(argv, ctx, args)
          },
        },
  ),
}
