/**
 * Comandos do React Native CLI. É por aqui que o build nativo empacota o JS: o Gradle
 * (`:app:createBundleReleaseJsAndAssets`) chama `react-native bundle`, e o vxrn
 * registra o `bundle` dele no lugar do Metro.
 *
 * 🔴 **O `bundle` do vxrn, sozinho, gera um APK que não passa do splash.** Ele lê a
 * configuração do One de globais que só a função `one()` do `vite.config.ts` grava — e
 * esse caminho nunca carrega o `vite.config.ts`. No `bun dev` o Vite carrega e tudo
 * funciona; no build de release saíam, sem erro nenhum:
 *
 * - **sem o `setupNative.ts`** (`__vxrnNativeEntryConfig.setupFile`): sem MMKV para a
 *   sessão, sem os setups do Tamagui;
 * - **sem o plugin de worklets do Reanimated**: o compilador do vxrn nasce com
 *   `enableReanimated: false`, e quem o liga é o One, depois de varrer as dependências no
 *   dev server. Medido no bundle: 513 funções `"worklet"` cruas, inclusive as do
 *   `@tamagui/animations-reanimated`. O primeiro componente animado quebra no render, o
 *   React não desenha nada, e o splash — que cobre a tela até o primeiro conteúdo —
 *   esconde o erro para sempre.
 *
 * ⚠️ O vxrn (1.25.16) e o One (1.14.2) estão em versões diferentes desde o 630f04d, e o
 * vxrn traz **a própria cópia** do `@vxrn/compiler`. Configurar a cópia do One não
 * adianta: tem que ser a instância que o vxrn importa — por isso a resolução a partir do
 * diretório dele, e pelo `realpath`, que é como o Node identifica o módulo ESM.
 *
 * `bun check native-bundle` confere as duas coisas no bundle gerado.
 */

const { realpathSync } = require('node:fs')
const { dirname, join } = require('node:path')
const { pathToFileURL } = require('node:url')

const vxrnCommands = require('vxrn/react-native-commands')

async function prepareOneForNativeBundle(root) {
  // 1. A função `one()` grava `__vxrnNativeEntryConfig` (setupFile, routerRoot, flags) e
  //    `__vxrnAddNativePlugins` (o tree-shake de código de servidor das rotas). É o que o
  //    próprio CLI do One faz antes de agir (`one/dist/esm/vite/loadConfig.mjs`).
  const { loadConfigFromFile } = await import('vite')
  await loadConfigFromFile({ command: 'build', mode: 'production' }, undefined, root)
  if (!globalThis.__vxrnNativeEntryConfig?.setupFile) {
    throw new Error(
      '[react-native.config] o vite.config.ts carregou, mas a função one() não gravou o setupFile — o bundle sairia sem o setupNative.ts.',
    )
  }

  // 2. Liga o plugin de worklets na instância do compilador que o vxrn usa.
  const resolveFrom = (dir, request) => require.resolve(request, { paths: [dir] })
  const vxrnDir = dirname(resolveFrom(root, 'vxrn/package.json'))
  const compilerPkgPath = resolveFrom(vxrnDir, '@vxrn/compiler/package.json')
  const compilerEntry = join(dirname(compilerPkgPath), require(compilerPkgPath).exports['.'].import)
  const compiler = await import(pathToFileURL(realpathSync(compilerEntry)).href)

  let hasReanimated = false
  try {
    resolveFrom(root, 'react-native-worklets/plugin')
    hasReanimated = true
  } catch {}
  compiler.configureVXRNCompilerPlugin({ enableReanimated: hasReanimated })
}

module.exports = {
  commands: vxrnCommands.map((command) =>
    command.name !== 'bundle'
      ? command
      : {
          ...command,
          func: async (argv, ctx, args) => {
            await prepareOneForNativeBundle(ctx.root)
            return command.func(argv, ctx, args)
          },
        },
  ),
}
