import { expo } from '@better-auth/expo'
import { time } from '@take-out/helpers'
import { betterAuth } from 'better-auth'
import { admin, bearer, jwt, magicLink } from 'better-auth/plugins'

import { DOMAIN } from '~/constants/app'
import { database } from '~/database/database'
import {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  EXTRA_TRUSTED_ORIGINS,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} from '~/server/env-server'

import { APP_SCHEME } from '../constants'
import { afterCreateUser } from './afterCreateUser'

console.info(`[better-auth] server`, BETTER_AUTH_SECRET.slice(0, 3), BETTER_AUTH_URL)

export const authServer = betterAuth({
  // using BETTER_AUTH_URL instead of baseUrl

  database,

  session: {
    freshAge: time.minute.days(2),
    storeSessionInDatabase: true,
  },

  emailAndPassword: {
    enabled: true,
  },

  /**
   * Google só entra na lista quando **as duas** credenciais existem.
   *
   * Registrar o provider sem client id faz o Better Auth responder 500 no
   * `/sign-in/social` — botão que existe e quebra é pior que botão que avisa. Com o
   * objeto vazio, o cliente recebe o erro `PROVIDER_NOT_FOUND` e a tela mostra o aviso
   * de "ainda não configurado".
   *
   * Para ligar: credenciais no Google Cloud Console (OAuth 2.0 Client ID, tipo
   * "Web application"), redirect URI
   * `<BETTER_AUTH_URL>/api/auth/callback/google`, e as duas variáveis no `.env.local`.
   */
  socialProviders:
    GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
          },
        }
      : {},

  trustedOrigins: [
    // match dev, prod, tauri
    `https://${DOMAIN}`,
    'http://localhost:8081',
    'http://host.docker.internal:8081',
    `${APP_SCHEME}://`,
    // Origem extra por env, separada por vírgula.
    //
    // ⚠️ **É isto que faz o app abrir no celular físico.** Pelo IP de rede que o
    // `bun dev` imprime como "Network", todo POST de auth volta 403 `INVALID_ORIGIN` —
    // e o IP da WSL muda a cada reinício, então string fixa aqui não resolveria.
    // Ex.: EXTRA_TRUSTED_ORIGINS="http://192.168.0.12:8081"
    ...EXTRA_TRUSTED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ],

  databaseHooks: {
    user: {
      create: {
        async after(user) {
          await afterCreateUser(user)
        },
      },
    },
  },

  plugins: [
    jwt({
      jwt: {
        expirationTime: '3y',
      },

      jwks: {
        // compat with zero
        keyPairConfig: { alg: 'EdDSA', crv: 'Ed25519' },
      },
    }),

    bearer(),

    // To support better-auth/client in React Native
    expo(),

    magicLink({
      sendMagicLink: async ({ email, url }) => {
        console.info('Magic link email would be sent to:', email, 'with URL:', url)
      },
    }),

    admin(),
  ],

  logger: {
    level: 'warn',
    log(level, message, ...args) {
      console.info(level, message, ...args)
    },
  },

  account: {
    accountLinking: {
      allowDifferentEmails: true,
    },
  },
})
