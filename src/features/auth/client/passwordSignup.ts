import { authClient } from './authClient'
import { standardizeBetterAuthError } from './passwordLogin'

import type { PasswordResult } from './passwordLogin'

/** Mínimo do Better Auth (`minPasswordLength` padrão). Conferido antes de chamar. */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Cria a conta e já entra.
 *
 * **Por que existe:** o Takeout só chama `signUp.email` no botão de demo
 * (`signInAsDemo.ts`). A tela de senha chamava `signIn.email` para todo mundo, então
 * e-mail novo dava `INVALID_EMAIL_OR_PASSWORD` — não havia como criar conta pela UI.
 *
 * ℹ️ **O servidor cai para sign-in quando o e-mail já existe.**
 * `src/features/auth/server/apiHandler.ts` intercepta o 422 de `/sign-up/email` e
 * repete a chamada como `/sign-in/email` com a mesma senha. Ou seja: cadastrar com
 * e-mail existente **e a senha certa** simplesmente entra; com a senha errada volta
 * `INVALID_EMAIL_OR_PASSWORD`, e é por isso que a mensagem daquele caso fala das duas
 * possibilidades.
 */
export async function passwordSignup(
  name: string,
  email: string,
  password: string
): Promise<PasswordResult> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      success: false,
      error: {
        code: 'PASSWORD_TOO_SHORT',
        title: 'Senha curta demais',
        message: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
      },
    }
  }

  const { error } = await authClient.signUp.email({ name, email, password })

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
            'Já existe uma conta com esse e-mail, e a senha não confere. Se a conta é sua, entre em vez de criar.',
        },
      }

    case 'INVALID_EMAIL':
      return {
        success: false,
        error: {
          code,
          title: 'E-mail inválido',
          message: 'Confira o endereço digitado.',
        },
      }

    case 'PASSWORD_TOO_SHORT':
      return {
        success: false,
        error: {
          code,
          title: 'Senha curta demais',
          message: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
        },
      }

    default:
      return {
        success: false,
        error: {
          code,
          title: 'Não foi possível criar a conta',
          message: `${message} (${code})`,
        },
      }
  }
}
