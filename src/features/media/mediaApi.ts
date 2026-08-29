// Cliente HTTP das rotas de mídia.
//
// Não usa o `authFetch` (@better-fetch) de propósito: ele envolve o erro em
// `{ data, error }` e aqui a UI precisa do status cru — 403 "sem assinatura" e 409
// "ainda subindo" levam a telas diferentes.
//
// Manda os dois formatos de sessão que o servidor aceita: cookie (web) e Bearer
// (nativo). `getAuthDataFromRequest` no servidor tenta cookie e depois o header, então
// a mesma chamada funciona nas duas plataformas.

import { API_URL } from '~/constants/urls'
import { authState } from '~/features/auth/client/authClient'

export class MediaApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'MediaApiError'
    this.status = status
    this.code = code
  }
}

export async function mediaApi<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    throw new MediaApiError(
      res.status,
      body?.code || 'http-error',
      body?.error || `Erro ${res.status} em ${path}`,
    )
  }

  return (await res.json()) as T
}
