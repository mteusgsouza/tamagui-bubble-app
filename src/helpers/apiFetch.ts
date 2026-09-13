// Cliente HTTP das rotas autenticadas do próprio app.
//
// Não usa o `authFetch` (@better-fetch) de propósito: ele envolve o erro em
// `{ data, error }` e a UI daqui precisa do **status e do código crus** — em mídia, 403
// "sem assinatura" e 409 "ainda subindo" levam a telas diferentes; em cobrança, 422
// "plano saiu de venda" e 501 "sem gateway" também.
//
// Manda os dois formatos de sessão que o servidor aceita: cookie (web) e Bearer
// (nativo). `getAuthDataFromRequest` no servidor tenta cookie e depois o header, então a
// mesma chamada funciona nas duas plataformas.
//
// ℹ️ Isto morava em `src/features/media/mediaApi.ts` e nunca foi só de mídia — o admin de
// pessoas já o usava. Virou helper com o nome certo quando a cobrança precisou do mesmo.

import { API_URL } from '~/constants/urls'
import { authState } from '~/features/auth/client/authClient'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = authState.value?.session?.token
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: string
      code?: string
    } | null
    throw new ApiError(
      res.status,
      body?.code || 'http-error',
      body?.error || `Erro ${res.status} em ${path}`,
    )
  }

  return (await res.json()) as T
}
