// O contrato que qualquer gateway precisa cumprir.
//
// O MVP roda com `providers/manual.ts` (o admin concede na mão). Quando um gateway real
// for escolhido — Stripe, Asaas, Pagar.me, Iugu — escreve-se só um `providers/<nome>.ts`.
// Sem migration, sem mexer em permission: `subscription.provider` e
// `payment.provider` já são texto livre no schema desde a Fase 3.

/** Status normalizado. É o mesmo enum de `subscription.status` no Postgres. */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired'

/**
 * Evento já traduzido do vocabulário do gateway para o nosso.
 *
 * Cada gateway fala um dialeto (`invoice.paid`, `PAYMENT_CONFIRMED`, `charge.succeeded`).
 * O `parseWebhook` de cada provider traduz; daqui pra dentro só existe isto.
 */
export type BillingEvent =
  | {
      type: 'subscription.updated'
      /** id da nossa `subscription`, quando o gateway o carrega de volta */
      subscriptionId?: string
      /** identificação do lado do gateway, para casar quando não temos o nosso id */
      providerSubscriptionId?: string
      userId?: string
      planId?: string
      status: SubscriptionStatus
      /** epoch ms — vira `currentPeriodEnd` */
      currentPeriodEnd?: number
    }
  | {
      type: 'payment.succeeded'
      providerPaymentId: string
      providerSubscriptionId?: string
      subscriptionId?: string
      userId?: string
      amountCents: number
      currency?: string
      /** epoch ms */
      paidAt?: number
    }
  | { type: 'ignored'; reason: string }

export type CheckoutRequest = {
  userId: string
  creatorId: string
  planId: string
  /** para onde o gateway devolve o usuário */
  returnUrl?: string
}

export type CheckoutResult =
  /** o gateway hospeda a página de pagamento */
  | { kind: 'redirect'; url: string }
  /** o provider resolveu na hora, sem sair do app (é o caso do `manual`) */
  | { kind: 'done'; subscriptionId: string; status: SubscriptionStatus }

export type BillingProvider = {
  /** aparece em `subscription.provider` e `payment.provider` */
  readonly id: string
  readonly label: string

  /** Começa uma assinatura. */
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>

  /** Cancela do lado do gateway. O nosso banco é atualizado por quem chama. */
  cancel(subscription: {
    id: string
    providerSubscriptionId?: string | null
  }): Promise<void>

  /**
   * Traduz o webhook do gateway. **Valida a assinatura** — devolver evento sem
   * conferir HMAC é entregar a base de assinaturas a quem souber a URL.
   *
   * Lança se a assinatura não confere.
   */
  parseWebhook(request: { rawBody: string; headers: Headers }): Promise<BillingEvent>
}
