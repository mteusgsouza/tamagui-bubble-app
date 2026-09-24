// O cliente das rotas de cobrança.
//
// Existe para a tela não repetir tratamento de erro: **os estados de falha são escopo**,
// não sobra. Tela de pagamento que falha em silêncio é a pior tela do app — o usuário
// fica sem saber se pagou, se deu erro, ou se deve tentar de novo.

import { Linking } from 'react-native'
import { isWeb } from 'tamagui'

import { apiFetch, ApiError } from '~/helpers/apiFetch'

/**
 * Para onde o gateway devolve o usuário.
 *
 * 🔴 **No nativo tem que ser deep link.** O checkout abre no navegador do sistema; sem o
 * esquema do app (`bubble://`, ver `app.config.ts`), o usuário paga e fica preso lá,
 * achando que a compra não valeu. Na web basta a origem atual.
 */
function returnUrl(path: string): string | undefined {
  if (isWeb) {
    return typeof location !== 'undefined' ? `${location.origin}${path}` : undefined
  }
  const scheme = process.env.APP_SCHEME || 'bubble'
  return `${scheme}://${path.replace(/^\//, '')}`
}

/**
 * Mensagem por código de erro — o usuário precisa saber **o que fazer**, não só que
 * falhou. Os códigos vêm das rotas em `app/api/billing/`.
 */
const CHECKOUT_MESSAGES: Record<string, string> = {
  unauthenticated: 'Sua sessão expirou. Entre de novo para assinar.',
  'plan-not-found': 'Esse plano não existe mais.',
  'plan-inactive': 'Esse plano saiu de venda enquanto a tela estava aberta.',
  'no-gateway': 'O pagamento ainda não está configurado. Fale com o criador.',
  'checkout-failed': 'Não deu para abrir o pagamento. Tente de novo em instantes.',
}

const PORTAL_MESSAGES: Record<string, string> = {
  unauthenticated: 'Sua sessão expirou. Entre de novo.',
  'no-portal': 'A gestão de assinatura não está disponível neste ambiente.',
  'no-customer': 'Você ainda não tem assinatura para gerenciar.',
}

// Mantido como reexport: o helper subiu para `~/helpers/apiMessage` quando o resto do
// app passou a falar REST, e os chamadores daqui continuam válidos.
export { apiMessage as billingMessage } from '~/helpers/apiMessage'

/**
 * Começa o checkout e devolve a URL hospedada do gateway.
 *
 * Não navega sozinho: quem chama decide o momento, porque na web o redirect descarta a
 * tela atual e no nativo abre o navegador do sistema.
 */
export async function startCheckout(planId: string): Promise<string> {
  // ⚠️ **Sem `/api` aqui.** `API_URL` já é `${SERVER_URL}/api` (`~/constants/urls`), então
  // prefixar de novo produz `/api/api/...` e **404** — que é exatamente o que a tela de
  // assinar mostrou. Os chamadores antigos passam `/media/...` e `/admin/...`.
  const res = await apiFetch<{ url?: string; kind?: string }>('/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ planId, returnUrl: returnUrl('/home/feed?checkout=success') }),
  })
  if (!res.url) {
    throw new ApiError(200, 'no-url', 'O gateway não devolveu a página de pagamento.')
  }
  return res.url
}

/** Abre o portal do gateway: trocar cartão, ver faturas, cancelar. */
export async function startPortal(): Promise<string> {
  // idem: `API_URL` já traz o `/api`
  const res = await apiFetch<{ url?: string }>('/billing/portal', {
    method: 'POST',
    body: JSON.stringify({ returnUrl: returnUrl('/home/settings') }),
  })
  if (!res.url) {
    throw new ApiError(200, 'no-url', 'O gateway não devolveu o portal.')
  }
  return res.url
}

/** Sai do app para a página do gateway, do jeito certo em cada plataforma. */
export function goToGateway(url: string) {
  if (isWeb) {
    if (typeof location !== 'undefined') location.href = url
    return
  }
  void Linking.openURL(url)
}

export { CHECKOUT_MESSAGES, PORTAL_MESSAGES, ApiError }
