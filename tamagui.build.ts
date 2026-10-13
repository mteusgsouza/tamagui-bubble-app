import type { TamaguiBuildOptions } from 'tamagui'

export default {
  disable: process.env.NODE_ENV !== 'production',
  components: ['tamagui'],
  config: './src/tamagui/tamagui.config.ts',
  outputCSS: './src/tamagui/tamagui.generated.css',

  /**
   * 🔴 **No empacotamento do APK o observador do config não pode nascer.**
   *
   * O hook `config` do plugin abre um `watchTamaguiConfig` — um serviço do esbuild, em
   * processo filho, que herda o stderr — e só o hook `buildEnd` o fecha. O `bundle` do
   * vxrn chama o `resolveConfig` do Vite, que roda o `config` e nunca o `buildEnd`: o
   * serviço fica órfão quando o node sai e segura o pipe que o Gradle lê. A tarefa
   * `:app:createBundleReleaseJsAndAssets` nunca fecha e o EAS corta o build no teto de
   * 45 min (builds `125ca5b1` e `960bb1f4`, marcados como *Canceled*).
   *
   * Quem avisa é o `react-native.config.cjs`. O observador só serve ao dev server, então o
   * `bun dev` e o `bun run build` ficam como estavam.
   */
  disableWatchTamaguiConfig: process.env.BUBBLE_NATIVE_BUNDLE === '1',
} satisfies TamaguiBuildOptions
