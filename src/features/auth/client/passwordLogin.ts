import { authClient } from './authClient'

/** Compartilhado com `passwordSignup` — as duas telas tratam o erro do mesmo jeito. */
export type PasswordResult =
  | { success: true; error?: undefined }
  | {
      success: false
      error: { code: string; title: string; message: string }
    }

/**
 * Login with email and password.
 */
export async function passwordLogin(
  email: string,
  password: string
): Promise<PasswordResult> {
  const { error } = await authClient.signIn.email({
    email,
    password,
  })

  if (!error) {
    return { success: true }
  }

  const { code, message } = standardizeBetterAuthError(error)

  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return {
        success: false,
        error: {
          code,
          title: 'Não deu para entrar',
          message:
            'E-mail ou senha incorretos. Se você ainda não tem conta, escolha "Criar conta".',
        },
      }

    default: {
      return {
        success: false,
        error: {
          code,
          title: 'Não foi possível entrar',
          message: `${message} (${code})`,
        },
      }
    }
  }
}

export function standardizeBetterAuthError(error: unknown) {
  let code = 'UNKNOWN'
  let message = 'Unknown error'

  if (error && typeof error === 'object') {
    const errorCode = Reflect.get(error, 'code')
    if (errorCode && typeof errorCode === 'string') {
      code = errorCode
    }

    const errorMessage = Reflect.get(error, 'message')
    if (errorMessage && typeof errorMessage === 'string') {
      message = errorMessage
    }
  }

  return { code, message }
}
