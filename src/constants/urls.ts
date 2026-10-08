import { getURL } from 'one'

/**
 * O que o `getURL()` do One devolve num build nativo de release quando ninguém informou
 * o servidor (`one/dist/esm/getURL.native.js`). Não é endereço de nada.
 */
const NATIVE_SERVER_URL_UNSET = 'http://one-server.example.com'

/**
 * Endereço do servidor do app — de onde saem a API e o auth.
 *
 * | onde roda | de onde vem |
 * |---|---|
 * | web | a própria origem (`location`) |
 * | nativo em desenvolvimento | o dev server que serviu o bundle (`getURL()`) |
 * | nativo de release (APK) | `ONE_SERVER_URL` **do momento do build**: o vxrn a grava no prelúdio do bundle e o `getURL()` a lê. Vem do perfil do `eas.json` |
 *
 * 🔴 **Nunca troque o marcador por um endereço padrão.** O código herdado do Takeout fazia
 * isso e caía em `https://takeout.tamagui.dev`, o servidor de demonstração da Tamagui: um
 * APK construído sem a variável mandaria o e-mail e a senha de quem loga para um servidor
 * de terceiro, sem erro nenhum. O `app.config.ts` barra esse build logo no início; isto
 * aqui é a segunda trava, para o build que escapar dela.
 */
export const SERVER_URL = (() => {
  if (typeof location !== 'undefined') {
    return `${location.protocol}//${location.host}`
  }

  const url = getURL()
  if (url === NATIVE_SERVER_URL_UNSET) {
    throw new Error(
      'Build nativo sem ONE_SERVER_URL: o app não sabe qual é o servidor. ' +
        'Defina a variável no perfil do eas.json (ou no ambiente do build local).',
    )
  }
  return url
})()

export const DEFAULT_HOT_UPDATE_SERVER_URL =
  'https://pckjvzbtdczlpkgujgkb.supabase.co/functions/v1/update-server'

export const API_URL = `${SERVER_URL}/api`
export const AUTH_URL = `${SERVER_URL}/api/auth`
