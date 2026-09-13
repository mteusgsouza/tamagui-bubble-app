// Provider Stripe — Checkout hospedado (`ui_mode: 'hosted_page'`).
//
// O adapter da Fase 9 já definia a forma (`createCheckout` / `cancel` / `parseWebhook`);
// aqui só se preenche o dialeto do Stripe. A rota `/api/billing/checkout` e a
// `/api/billing/webhook/[provider]` **não mudam** — elas já sabem lidar com
// `{ kind: 'redirect' }` e com o corpo cru.
//
// Os parâmetros da sessão vieram da Checkout Studio e estão anotados como tal: mexer
// neles aqui e não lá faz a UI do Stripe e o código divergirem em silêncio.

import Stripe from 'stripe'
import { and, eq } from 'drizzle-orm'

import { getDb } from '~/database'
import {
  billingCustomer,
  planProviderPrice,
  user as userTable,
} from '~/database/schema-private'
import { plan } from '~/database/schema-public'
import { BETTER_AUTH_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '~/server/env-server'

import { WebhookSignatureError } from '../webhookSignature'
import { mapStripeEvent } from './stripeEvents'

import type { BillingProvider } from '../types'

const PROVIDER_ID = 'stripe'

/**
 * Cliente preguiçoso.
 *
 * Instanciar no topo do módulo faria a **importação** do arquivo explodir quando a chave
 * não existe — e o `registry.ts` importa todos os providers, então o app inteiro
 * quebraria por uma chave de um gateway que talvez nem esteja ativo.
 *
 * ⚠️ Sem `apiVersion` de propósito: fixar uma versão que não é a da conta troca a forma
 * das respostas. Quem manda é a versão configurada no painel.
 */
let client: Stripe | null = null
function stripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error(
      'STRIPE_SECRET_KEY não está definida. Preencha no `.env.local` — ver STRIPE_INTEGRATION_TODO.md.',
    )
  }
  client ??= new Stripe(STRIPE_SECRET_KEY)
  return client
}

/**
 * O Customer do usuário no Stripe, criando na primeira vez.
 *
 * A corrida de dois checkouts simultâneos é resolvida no banco (`onConflictDoNothing` +
 * releitura), não com `if (!existe) cria`: o índice único é a única barreira que vale
 * quando há dois processos.
 */
async function ensureCustomer(userId: string): Promise<string> {
  const db = getDb()

  const [existing] = await db
    .select({ customerId: billingCustomer.customerId })
    .from(billingCustomer)
    .where(
      and(eq(billingCustomer.userId, userId), eq(billingCustomer.provider, PROVIDER_ID)),
    )
    .limit(1)

  if (existing) return existing.customerId

  const [person] = await db
    .select({ email: userTable.email, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)

  const customer = await stripe().customers.create(
    {
      email: person?.email ?? undefined,
      name: person?.name ?? undefined,
      // o caminho de volta: do painel do Stripe para o nosso usuário
      metadata: { userId },
    },
    // chave estável por usuário: retry de rede não cria um segundo customer
    { idempotencyKey: `customer-${PROVIDER_ID}-${userId}` },
  )

  await db
    .insert(billingCustomer)
    .values({ userId, provider: PROVIDER_ID, customerId: customer.id })
    .onConflictDoNothing()

  const [saved] = await db
    .select({ customerId: billingCustomer.customerId })
    .from(billingCustomer)
    .where(
      and(eq(billingCustomer.userId, userId), eq(billingCustomer.provider, PROVIDER_ID)),
    )
    .limit(1)

  // se outro processo ganhou a corrida, o customer que vale é o dele
  return saved?.customerId ?? customer.id
}

/** O preço ativo do plano no Stripe, junto do que decide o modo da sessão. */
async function resolvePlan(planId: string) {
  const db = getDb()
  const [row] = await db
    .select({
      providerPriceId: planProviderPrice.providerPriceId,
      interval: plan.interval,
      accessDays: plan.accessDays,
    })
    .from(planProviderPrice)
    .innerJoin(plan, eq(plan.id, planProviderPrice.planId))
    .where(
      and(
        eq(planProviderPrice.planId, planId),
        eq(planProviderPrice.provider, PROVIDER_ID),
        eq(planProviderPrice.active, true),
      ),
    )
    .limit(1)

  if (!row) {
    throw new Error(
      `O plano ${planId} não tem preço no Stripe. Rode: bun run:dev scripts/stripe-sync-plans.ts`,
    )
  }
  return row
}

/**
 * Prazo de acesso de uma compra avulsa, em epoch ms.
 *
 * Vive aqui, e não no `stripeEvents.ts`, porque depende do banco — e aquele arquivo é
 * função pura de propósito.
 */
async function accessEndForPlan(planId: string): Promise<number | undefined> {
  const db = getDb()
  const [row] = await db
    .select({ interval: plan.interval, accessDays: plan.accessDays })
    .from(plan)
    .where(eq(plan.id, planId))
    .limit(1)

  if (!row || row.interval !== 'once') return undefined

  // sem `accessDays` o avulso não teria vencimento e viraria vitalício em silêncio
  const days = row.accessDays ?? 30
  return Date.now() + days * 24 * 60 * 60 * 1000
}

export const stripeProvider: BillingProvider = {
  id: PROVIDER_ID,
  label: 'Stripe',

  async createCheckout({ userId, planId, returnUrl }) {
    const customerId = await ensureCustomer(userId)
    const { providerPriceId: price, interval } = await resolvePlan(planId)
    // compra avulsa cobra uma vez; `mode: 'subscription'` exigiria um preço recorrente e
    // o Stripe recusaria a sessão
    const isOneTime = interval === 'once'

    const base = (returnUrl || BETTER_AUTH_URL || '').replace(/\/$/, '')
    if (!base) {
      throw new Error(
        'Sem URL de retorno: informe `returnUrl` ou defina BETTER_AUTH_URL.',
      )
    }

    const session = await stripe().checkout.sessions.create({
      // --- configurado na Checkout Studio (não editar só aqui) ---
      ui_mode: 'hosted_page',
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      submit_type: 'auto',
      integration_identifier: 'hosted_mobile_app_0001',
      origin_context: 'mobile_app',
      // `payment_method_collection` só existe em `mode: 'subscription'`
      ...(isOneTime ? null : { payment_method_collection: 'always' as const }),
      // --- fim do bloco da Studio ---

      mode: isOneTime ? 'payment' : 'subscription',
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}/home/feed?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/home/feed?checkout=cancel`,

      // 🔴 **No recorrente, o metadata vai nos dois lugares, e não é redundância.**
      // A sessão carrega o dela; os eventos `customer.subscription.*` carregam o da
      // **assinatura**. Sem `subscription_data.metadata`, o primeiro evento funciona e
      // todos os seguintes caem em `ignored` — sem erro nenhum, o que é pior.
      //
      // No avulso não existe Subscription do outro lado: o metadata vai na sessão e no
      // PaymentIntent, que são os dois objetos que geram evento.
      metadata: { userId, planId },
      ...(isOneTime
        ? { payment_intent_data: { metadata: { userId, planId } } }
        : { subscription_data: { metadata: { userId, planId } } }),
    })

    if (!session.url) {
      throw new Error('O Stripe não devolveu URL de checkout.')
    }

    return { kind: 'redirect', url: session.url }
  },

  async cancel({ providerSubscriptionId }) {
    if (!providerSubscriptionId) {
      // assinatura que nasceu por concessão manual não existe no Stripe
      return
    }
    await stripe().subscriptions.cancel(providerSubscriptionId)
  },

  /**
   * Portal hospedado: trocar cartão, ver faturas e cancelar.
   *
   * ⚠️ **Não cria Customer aqui.** Sem `billingCustomer` a pessoa nunca comprou, e abrir
   * um portal vazio para ela é pior que não oferecer o botão. Quem não tem, recebe `null`
   * do chamador e a tela some com a opção.
   *
   * O cancelamento feito lá volta como `customer.subscription.updated` — nenhuma escrita
   * especial é necessária deste lado.
   */
  async createPortalSession({ userId, returnUrl }) {
    const db = getDb()
    const [row] = await db
      .select({ customerId: billingCustomer.customerId })
      .from(billingCustomer)
      .where(
        and(
          eq(billingCustomer.userId, userId),
          eq(billingCustomer.provider, PROVIDER_ID),
        ),
      )
      .limit(1)

    if (!row) throw new Error('Esse usuário ainda não tem cliente no Stripe.')

    const session = await stripe().billingPortal.sessions.create({
      customer: row.customerId,
      ...(returnUrl ? { return_url: returnUrl } : null),
    })

    return { url: session.url }
  },

  async parseWebhook({ rawBody, headers }) {
    const signature = headers.get('stripe-signature') || ''

    if (!STRIPE_WEBHOOK_SECRET) {
      throw new WebhookSignatureError(
        'STRIPE_WEBHOOK_SECRET não está definido — o webhook fica fechado até ter segredo.',
      )
    }

    let event: Stripe.Event
    try {
      // `constructEvent` do SDK, e não o `verifyHmac` daqui: o Stripe assina
      // `${timestamp}.${corpo}` e manda em `t=...,v1=...`, enquanto o nosso helper assina
      // só o corpo. E é o SDK que confere a janela de tempo do `t` — sem isso, um corpo
      // assinado antigo seria reenviável para sempre.
      event = stripe().webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)
    } catch (err) {
      throw new WebhookSignatureError(
        err instanceof Error ? err.message : 'Assinatura inválida.',
      )
    }

    const mapped = mapStripeEvent(event)

    // A compra avulsa sai do mapeador **sem prazo** — ele é função pura e o prazo mora em
    // `plan.accessDays`. Completar aqui é o que impede o avulso de virar vitalício.
    // Recorrente não entra: quem manda o vencimento é o Stripe, em `current_period_end`.
    if (
      mapped.type === 'subscription.updated' &&
      !mapped.providerSubscriptionId &&
      mapped.currentPeriodEnd === undefined &&
      mapped.planId
    ) {
      const currentPeriodEnd = await accessEndForPlan(mapped.planId)
      if (currentPeriodEnd) return { ...mapped, currentPeriodEnd }
    }

    return mapped
  },
}
