#!/usr/bin/env bun

/**
 * @description Liga cada `plan` do app a um Price do Stripe, gravando em `planProviderPrice`.
 *
 *   bun run:dev scripts/stripe-sync-plans.ts
 *   bun run:dev scripts/stripe-sync-plans.ts --adopt plan-trial=price_1UF14I...
 *   bun run:dev scripts/stripe-sync-plans.ts --dry-run
 *
 * Idempotente: plano que já tem preço ativo é pulado. Rodar duas vezes não duplica nada
 * no Stripe.
 *
 * **Um Product por plano.** Não é preferência: o nome do Product é o que aparece no line
 * item do Checkout e na fatura, então dois planos no mesmo Product saem com o mesmo nome
 * e o cliente não distingue o que comprou.
 *
 * ⚠️ **Price no Stripe é imutável.** Mudar o valor de um plano não edita o Price: cria um
 * novo. Por isso `planProviderPrice` tem `active` — o preço velho continua na tabela
 * porque assinatura vendida ainda aponta para ele (é o mesmo grandfathering da decisão 16
 * do `STATE`, que nunca apaga plano).
 */

import { Pool } from 'pg'
import Stripe from 'stripe'

const DB = process.env.ZERO_UPSTREAM_DB
const KEY = process.env.STRIPE_SECRET_KEY

if (!DB) {
  console.error('❌ ZERO_UPSTREAM_DB não está no ambiente.')
  console.error('   Rode assim:  bun run:dev scripts/stripe-sync-plans.ts')
  process.exit(1)
}
if (!KEY) {
  console.error('❌ STRIPE_SECRET_KEY não está no ambiente. Preencha o .env.local.')
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

/**
 * `--adopt plan-trial=price_123` ou `--adopt plan-trial=prod_123` — liga o plano a algo
 * que **já existe** no Stripe, em vez de criar outro. Aceita Product porque é o id que o
 * painel mostra na lista; o Price é resolvido a partir dele.
 */
const adopted = new Map<string, string>()
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--adopt') continue
  const pair = args[i + 1] ?? ''
  const [planId, ref] = pair.split('=')
  if (!planId || !(ref?.startsWith('price_') || ref?.startsWith('prod_'))) {
    console.error(`❌ --adopt esperava planId=price_... ou planId=prod_..., recebeu "${pair}"`)
    process.exit(1)
  }
  adopted.set(planId, ref)
}

/** O Price de um Product. Recusa quando há mais de um ativo — adivinhar aqui é cobrar errado. */
async function priceIdFromProduct(productId: string, planId: string) {
  const { data } = await stripe.prices.list({ product: productId, active: true, limit: 10 })
  const [price] = data
  if (!price) {
    throw new Error(`${planId}: o produto ${productId} não tem preço ativo.`)
  }
  if (data.length > 1) {
    throw new Error(
      `${planId}: o produto ${productId} tem ${data.length} preços ativos ` +
        `(${data.map((p) => p.id).join(', ')}). Passe o price_... que você quer.`,
    )
  }
  return price.id
}

const pool = new Pool({ connectionString: DB })
const stripe = new Stripe(KEY)

const PROVIDER = 'stripe'

type PlanRow = {
  id: string
  name: string
  priceCents: number
  currency: string
  interval: 'month' | 'year' | 'once'
  active: boolean
}

async function sync() {
  const client = await pool.connect()

  try {
    const { rows: plans } = await client.query<PlanRow>(
      `SELECT id, name, "priceCents", currency, interval, active
         FROM plan WHERE active = true ORDER BY "order" ASC`,
    )

    if (!plans.length) {
      console.log('Nenhum plano ativo. Rode antes: bun run:dev scripts/seed-courses.ts')
      return
    }

    for (const plan of plans) {
      const { rows: existing } = await client.query(
        `SELECT "providerPriceId" FROM "planProviderPrice"
          WHERE "planId" = $1 AND provider = $2 AND active = true LIMIT 1`,
        [plan.id, PROVIDER],
      )

      if (existing.length) {
        console.log(`• ${plan.id}: já ligado a ${existing[0].providerPriceId} — pulado`)
        continue
      }

      // plano sem preço não vira Price: o Stripe aceitaria R$ 0,00 e o cliente "compraria"
      // de graça sem ninguém perceber
      if (plan.priceCents <= 0) {
        console.warn(
          `⚠️  ${plan.id} ("${plan.name}") tem priceCents = 0 — pulado.\n` +
            '    Defina o preço no banco (ou no seed) antes de sincronizar.',
        )
        continue
      }

      const adoptRef = adopted.get(plan.id)

      if (adoptRef) {
        const adopt = adoptRef.startsWith('prod_')
          ? await priceIdFromProduct(adoptRef, plan.id)
          : adoptRef

        // confere antes de gravar: adotar um Price que não bate com o plano criaria uma
        // divergência silenciosa entre o que a tela mostra e o que o cartão é cobrado
        const price = await stripe.prices.retrieve(adopt)
        const problems: string[] = []

        if (price.unit_amount !== plan.priceCents) {
          problems.push(
            `valor ${price.unit_amount} ≠ priceCents ${plan.priceCents} do plano`,
          )
        }
        if (price.currency?.toUpperCase() !== plan.currency?.toUpperCase()) {
          problems.push(`moeda ${price.currency} ≠ ${plan.currency}`)
        }
        const recurring = price.recurring?.interval
        if (plan.interval === 'once' && recurring) {
          problems.push(`plano é avulso mas o Price é recorrente (${recurring})`)
        }
        if (plan.interval !== 'once' && recurring !== plan.interval) {
          problems.push(`plano é ${plan.interval} mas o Price é ${recurring ?? 'avulso'}`)
        }

        if (problems.length) {
          console.error(`❌ ${plan.id}: não adotei ${adopt} —`)
          for (const p of problems) console.error(`     ${p}`)
          continue
        }

        if (dryRun) {
          console.log(`[dry-run] ${plan.id}: adotaria ${adopt}`)
          continue
        }

        await client.query(
          `INSERT INTO "planProviderPrice" (id, "planId", provider, "providerPriceId", active)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT ("providerPriceId") DO NOTHING`,
          [`ppp-${crypto.randomUUID()}`, plan.id, PROVIDER, adopt],
        )
        console.log(`✓ ${plan.id}: adotado ${adopt}`)
        continue
      }

      if (dryRun) {
        console.log(
          `[dry-run] ${plan.id}: criaria Product "${plan.name}" e Price ` +
            `${plan.priceCents} ${plan.currency} ${plan.interval}`,
        )
        continue
      }

      const product = await stripe.products.create(
        {
          name: plan.name,
          // o caminho de volta: do painel do Stripe para o nosso plano
          metadata: { planId: plan.id },
        },
        { idempotencyKey: `product-${plan.id}` },
      )

      const price = await stripe.prices.create(
        {
          product: product.id,
          unit_amount: plan.priceCents,
          currency: (plan.currency || 'BRL').toLowerCase(),
          ...(plan.interval === 'once'
            ? null
            : { recurring: { interval: plan.interval } }),
          metadata: { planId: plan.id },
        },
        { idempotencyKey: `price-${plan.id}-${plan.priceCents}-${plan.interval}` },
      )

      await client.query(
        `INSERT INTO "planProviderPrice" (id, "planId", provider, "providerPriceId", active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT ("providerPriceId") DO NOTHING`,
        [`ppp-${crypto.randomUUID()}`, plan.id, PROVIDER, price.id],
      )

      console.log(`✓ ${plan.id}: ${product.id} / ${price.id}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

sync().catch((err) => {
  console.error('❌ falhou:', err instanceof Error ? err.message : err)
  process.exit(1)
})
