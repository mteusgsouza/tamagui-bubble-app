import type { BetterAuthClientPlugin } from 'better-auth'
import type { demoLogin } from '../server/demoLogin'

/**
 * Par do plugin `demoLogin` no cliente: dá `authClient.signIn.demo()` e
 * `authClient.demoLogin.status()`, tipados pelo servidor.
 *
 * 🔴 **O `atomListeners` não é opcional.** O cliente do Better Auth só recarrega a sessão
 * depois de rotas que ele conhece (`/sign-in/email`, `/sign-up/email`...). Sem avisar que
 * `/sign-in/demo` também muda a sessão, o cookie chega, o `router.replace` acontece, e o
 * guard ainda acha que ninguém entrou — volta para o login. No nativo o `@better-auth/expo`
 * dispara o mesmo sinal ao guardar o cookie; na web, é só isto.
 */
export const demoLoginClient = () =>
  ({
    id: 'demo-login',
    $InferServerPlugin: {} as ReturnType<typeof demoLogin>,
    pathMethods: {
      '/sign-in/demo': 'POST',
    },
    atomListeners: [
      {
        matcher: (path) => path === '/sign-in/demo',
        signal: '$sessionSignal',
      },
    ],
  }) satisfies BetterAuthClientPlugin
