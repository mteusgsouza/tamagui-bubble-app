import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'

import { DEMO_ACCOUNT_EMAIL, DEMO_ACCOUNT_NAME } from '../demoAccount'
import { afterCreateUser } from './afterCreateUser'

import type { BetterAuthPlugin, User } from 'better-auth'

/**
 * Liga o botão "Entrar com a conta demo".
 *
 * **Lido em runtime, a cada requisição** — colchetes para o bundler não embutir o valor no
 * build. É isso que deixa desligar o acesso de teste mexendo só no `app.env` do servidor e
 * reiniciando o container: o botão some também do APK já instalado, que pergunta ao
 * servidor (`/demo-login/status`) em vez de carregar uma `VITE_*` congelada no build.
 */
export const isDemoLoginEnabled = () => process.env['DEMO_LOGIN_ENABLED'] === '1'

/**
 * O que a conta demo **não** pode fazer, mesmo logada.
 *
 * Ela é compartilhada: o que um testador muda, todos os seguintes herdam.
 * - `/list-sessions` mostraria IP e navegador de **todos** os outros testadores.
 * - `/revoke-session(s)` derrubaria a sessão deles.
 * - `/link-social` grudaria o Google de alguém na conta demo — e o próximo "Continuar com
 *   Google" dessa pessoa cairia aqui, não na conta dela.
 * - `/update-user` trocaria o nome que aparece nos comentários de todo mundo.
 *
 * Trocar senha ou e-mail já é impossível sem isso (não há conta de credencial), mas fica
 * na lista para a regra não depender de um detalhe de implementação do Better Auth.
 *
 * 🔴 **Quem aplica é o `apiHandler.ts`, não um `hooks.before` deste plugin.** Foi a
 * primeira versão, e deixava passar tudo que chegava com `Authorization: Bearer`: o Better
 * Auth entrega a **cada** hook o contexto original, e a conversão do bearer em cookie (do
 * plugin `bearer`) só é aplicada no endpoint, depois de todos os hooks. O hook não via
 * sessão nenhuma e liberava. Medido: `update-user` e `revoke-sessions` responderam 200.
 */
export const BLOCKED_FOR_DEMO = new Set([
  '/update-user',
  '/change-email',
  '/change-password',
  '/link-social',
  '/unlink-account',
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/delete-user',
])

/**
 * Plugin do Better Auth para a conta demo pública.
 *
 * **Por que um endpoint do Better Auth e não uma rota `+api.ts` própria:** a resposta sai
 * pelo mesmo caminho de um login de verdade — o cookie de sessão pelo `setSessionCookie`,
 * o `set-auth-token` pelo plugin `bearer`, e o `@better-auth/expo` guardando o cookie no
 * nativo. Uma rota à parte teria de reproduzir as três coisas e divergiria na primeira
 * atualização da biblioteca.
 *
 * O rate limit do Better Auth vale aqui como em qualquer `/sign-in/*`: cada clique cria
 * uma sessão, e é ele que impede alguém de encher a tabela `session` num laço.
 *
 * Desligar de emergência sem mexer no servidor: banir a conta pelo admin. O plugin `admin`
 * recusa criar sessão para usuário banido, e o botão passa a avisar que falhou.
 */
export const demoLogin = () =>
  ({
    id: 'demo-login',

    endpoints: {
      demoLoginStatus: createAuthEndpoint(
        '/demo-login/status',
        { method: 'GET' },
        async (ctx) => ctx.json({ enabled: isDemoLoginEnabled() }),
      ),

      signInDemo: createAuthEndpoint('/sign-in/demo', { method: 'POST' }, async (ctx) => {
        if (!isDemoLoginEnabled()) {
          throw new APIError('NOT_FOUND', {
            message: 'O acesso de demonstração está desligado.',
          })
        }

        const user = await findOrCreateDemoUser(ctx.context.internalAdapter)
        if (!user) {
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'Não foi possível preparar a conta de demonstração.',
          })
        }

        // 🔴 Completa a conta a cada entrada, não só quando ela nasce. Em 19/11/2026 o
        // `afterCreateUser` do primeiro clique em produção falhou (o banco estava sem as
        // colunas novas do `userState`): a linha de `user` ficou, a de `userPublic` não,
        // o clique deu erro e o segundo entrou numa conta pela metade — sem `userPublic`,
        // toda FK de conteúdo (comentário, matrícula) quebra. Ele é idempotente: com a
        // conta inteira são duas leituras e sai.
        await afterCreateUser(user)

        const session = await ctx.context.internalAdapter.createSession(user.id)
        if (!session) {
          throw new APIError('INTERNAL_SERVER_ERROR', {
            message: 'Não foi possível abrir a sessão de demonstração.',
          })
        }

        await setSessionCookie(ctx, { session, user })

        return ctx.json({
          token: session.token,
          user: { id: user.id, email: user.email, name: user.name },
        })
      }),
    },
  }) satisfies BetterAuthPlugin

/** O pedaço do `internalAdapter` do Better Auth que a conta demo usa. */
type DemoUserStore = {
  findUserByEmail: (email: string) => Promise<{ user: User } | null>
  createUser: (user: {
    email: string
    name: string
    emailVerified: boolean
  }) => Promise<User>
}

/**
 * A conta nasce no primeiro clique, como as contas de teste do dev: um botão que só
 * funciona depois de alguém rodar um seed quebra justamente no banco recém-criado.
 *
 * `createUser` passa pelos `databaseHooks`, então o `afterCreateUser` cria `userPublic` e
 * `userState` como para qualquer cadastro (invariante 2 do CLAUDE.md).
 *
 * Dois primeiros cliques simultâneos: o segundo `createUser` bate no índice único do
 * e-mail. Em vez de devolver erro, relê — a conta que o outro criou serve igual.
 */
async function findOrCreateDemoUser(adapter: DemoUserStore) {
  const found = await adapter.findUserByEmail(DEMO_ACCOUNT_EMAIL)
  if (found?.user) return found.user

  try {
    return await adapter.createUser({
      email: DEMO_ACCOUNT_EMAIL,
      name: DEMO_ACCOUNT_NAME,
      emailVerified: true,
    })
  } catch (error) {
    const again = await adapter.findUserByEmail(DEMO_ACCOUNT_EMAIL)
    if (again?.user) return again.user
    throw error
  }
}
