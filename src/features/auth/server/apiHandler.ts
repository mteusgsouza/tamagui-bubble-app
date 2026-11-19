import { getAuthDataFromRequest } from '@take-out/better-auth-utils/server'
import { prettyPrintResponse } from '@take-out/helpers'

import { ADMIN_WHITELIST } from '~/server/constants-server'

import { isDemoAccountEmail } from '../demoAccount'
import { authServer } from './authServer'
import { BLOCKED_FOR_DEMO } from './demoLogin'

export function authAPIHandler(method: 'GET' | 'POST') {
  return async (req: Request) => {
    try {
      const url = new URL(req.url)

      const refused = await refuseForDemoAccount(req, url)
      if (refused) return refused

      if (url.pathname.includes('/api/auth/sign-up/email')) {
        const clonedReq = req.clone()
        const body = await clonedReq.json()

        // o e-mail da conta demo é reservado: cadastrá-lo pelo formulário antes do primeiro
        // clique no botão criaria a conta **com senha** — de quem cadastrou
        if (isDemoAccountEmail(body?.email)) {
          return Response.json(
            { message: 'Este e-mail é reservado.', code: 'DEMO_ACCOUNT' },
            { status: 403 },
          )
        }

        const res = await authServer.handler(req)

        if (res.status === 422) {
          console.info(`Sign-up attempt for existing email: ${body.email}`)

          const signInUrl = url.toString().replace('/sign-up/email', '/sign-in/email')
          const signInReq = new Request(signInUrl, {
            method: 'POST',
            headers: req.headers,
            body: JSON.stringify({
              email: body.email,
              password: body.password,
            }),
          })

          const signInRes = await authServer.handler(signInReq)
          console.info(
            `[auth] Auto sign-in for existing user ${signInRes.status}`,
            signInUrl,
          )

          if (process.env.DEBUG || signInRes.status >= 400) {
            void prettyPrintResponse(signInRes)
          }

          return signInRes
        }

        console.info(`[auth] ${method} ${res.status}`, req.url)

        if (process.env.DEBUG || res.status >= 400) {
          void prettyPrintResponse(res)
        }

        return res
      }

      const res = await authServer.handler(req)
      console.info(`[auth] ${method} ${res.status}`, req.url)

      const processedResponse = await handleAuthCallback(req, res)

      if (process.env.DEBUG || processedResponse.status >= 400) {
        void prettyPrintResponse(processedResponse)
      }

      return processedResponse
    } catch (err) {
      console.error(`[auth] Error in ${method} ${req.url}:`, err)
      if (err instanceof Error) {
        console.error('Error stack:', err.stack)
      }
      return new Response(`Error: ${err instanceof Error ? err.message : String(err)}`, {
        status: 500,
      })
    }
  }
}

/**
 * Recusa, para a conta demo pública, as rotas de `BLOCKED_FOR_DEMO` (o porquê de cada uma
 * está lá, em `demoLogin.ts`).
 *
 * Fica nesta camada porque aqui a sessão se resolve pelo mesmo `getAuthDataFromRequest`
 * que todas as rotas do app usam — cookie **e** `Authorization: Bearer`. Dentro de um hook
 * do Better Auth o bearer ainda não virou cookie, e a checagem passava em branco.
 *
 * Só custa uma leitura de sessão nas rotas da lista; o resto do auth não paga nada.
 */
async function refuseForDemoAccount(req: Request, url: URL): Promise<Response | null> {
  const path = url.pathname.replace(/^\/api\/auth/, '')
  if (!BLOCKED_FOR_DEMO.has(path)) return null

  const auth = await getAuthDataFromRequest(authServer, req).catch(() => null)
  if (!isDemoAccountEmail(auth?.email)) return null

  return Response.json(
    { message: 'A conta de demonstração não pode alterar isso.', code: 'DEMO_ACCOUNT' },
    { status: 403 },
  )
}

async function handleAuthCallback(req: Request, res: Response): Promise<Response> {
  const url = new URL(req.url)

  const isAuthCallback =
    url.pathname.startsWith('/api/auth/magic-link/verify') ||
    url.pathname.startsWith('/api/auth/callback/')

  if (!isAuthCallback || res.status !== 302) {
    return res
  }

  const sessionToken = res.headers.get('set-auth-token')
  if (!sessionToken) {
    return res
  }

  const session = await getSessionFromToken(req, sessionToken)
  if (!session?.user) {
    return res
  }

  const user = session.user
  const email = user.email?.toLowerCase()
  const accessResult = checkUserAccess(email, user.role || undefined)

  if (!accessResult.allowed) {
    const redirectUrl = new URL('/_/login', req.url)
    redirectUrl.searchParams.set('notAllowed', '1')
    return createRedirectResponse(res, redirectUrl)
  }

  return res
}

async function getSessionFromToken(req: Request, sessionToken: string) {
  const sessionHeaders = new Headers(req.headers)
  sessionHeaders.set('cookie', `better-auth.session_token=${sessionToken}`)

  return authServer.api.getSession({ headers: sessionHeaders })
}

function createRedirectResponse(originalResponse: Response, redirectUrl: URL): Response {
  return new Response(null, {
    status: 302,
    headers: {
      ...Object.fromEntries(originalResponse.headers.entries()),
      location: redirectUrl.toString(),
    },
  })
}

function checkUserAccess(email: string | undefined, role?: string): { allowed: boolean } {
  if (!email) {
    return { allowed: false }
  }

  // allow admins and whitelisted users
  if (ADMIN_WHITELIST.has(email) || role === 'admin') {
    return { allowed: true }
  }

  // for the free version, allow all authenticated users
  return { allowed: true }
}
