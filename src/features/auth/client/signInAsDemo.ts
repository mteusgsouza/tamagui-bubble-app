import { DEMO_EMAIL, DEMO_NAME, DEMO_PASSWORD } from '~/constants/app'
import { authClient } from '~/features/auth/client/authClient'

/**
 * Entra com uma conta conhecida, criando-a se ainda não existir.
 *
 * O `signUp` vem antes de propósito: num banco recém-criado (`bun backend:clean`) a
 * conta não existe, e um botão de atalho que só funciona depois de alguém rodar um seed
 * é um botão que quebra na hora em que mais se precisa dele. `422` é "e-mail já existe",
 * que é o caminho normal da segunda vez — e por isso não é erro.
 *
 * ⚠️ Só para contas de teste do ambiente local (`devAccounts.ts`) e para a demonstração.
 * Em caminho de usuário de verdade, cadastro e login são telas separadas, e isto aqui
 * é exatamente o que a decisão daquela separação proíbe: com `signUp` primeiro, e-mail
 * digitado errado vira conta nova em vez de "senha incorreta".
 */
export const signInWithPassword = async (credentials: {
  name: string
  email: string
  password: string
}) => {
  const { error: signupError } = await authClient.signUp.email(credentials)

  if (signupError && signupError.status !== 422) {
    return { error: signupError }
  }

  const { error } = await authClient.signIn.email({
    email: credentials.email,
    password: credentials.password,
  })

  if (error) {
    return { error }
  }

  return { success: true }
}

export const signInAsDemo = async () =>
  signInWithPassword({ name: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD })
