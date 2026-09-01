// Brand
export const APP_NAME = 'Bubble'

/**
 * A versão do app — **fonte única**.
 *
 * Lida pelo `app.config.ts` (vira `version` e `runtimeVersion` no build nativo) e pela
 * tela de Perfil. Antes eram três lugares soltos e já divergiam: o `package.json` e o
 * `app.config.ts` diziam 0.0.1 enquanto a tela mostrava v1.0.0 escrito à mão.
 *
 * Ao subir, mexa aqui **e** no `package.json`, que não consegue importar daqui.
 */
export const APP_VERSION = '1.0.0'
export const APP_NAME_LOWERCASE = 'bubble'

// Domain
// ⚠️ NÃO renomear junto com a marca: `DEMO_EMAIL` deriva daqui e a conta demo que existe
// no banco é `demo@takeout.tamagui.dev`. Trocar o domínio quebra o login de demonstração.
export const DOMAIN = 'takeout.tamagui.dev'

// Social
export const TWITTER_URL = 'https://x.com/tamagui__js'
export const GITHUB_URL = 'https://github.com/tamagui'

// Email
export const ADMIN_EMAIL = `admin@${DOMAIN}`

// Demo user (for takeout demo site)
export const DEMO_EMAIL = `demo@${DOMAIN}`
export const DEMO_PASSWORD = 'demopassword123'
export const DEMO_NAME = 'Demo User'
