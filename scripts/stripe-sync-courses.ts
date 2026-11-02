#!/usr/bin/env bun

/**
 * @description Liga cada `course` à venda a um Price do Stripe, gravando em `courseProviderPrice`.
 *
 *   bun run:dev scripts/stripe-sync-courses.ts
 *   bun run:dev scripts/stripe-sync-courses.ts --dry-run
 *   bun run:dev scripts/stripe-sync-courses.ts --adopt <courseId>=price_1UF14I...
 *
 * Irmão de `stripe-sync-plans.ts` — leia aquele primeiro. Idempotente: curso cujo preço
 * ativo já bate com `course.priceCents` é pulado.
 *
 * **Um Product por curso.** O nome do Product é o que aparece no line item do Checkout e
 * na fatura; dois cursos no mesmo Product sairiam com o mesmo nome.
 *
 * ⚠️ **Price no Stripe é imutável.** Mudou `course.priceCents`? O Price antigo não é
 * editado: fica `active = false` (quem já comprou aponta para ele) e nasce outro, no
 * **mesmo** Product. Sem rodar este script depois de mudar o preço no admin, o Checkout
 * continua cobrando o valor antigo.
 */

import { Pool } from 'pg'
import Stripe from 'stripe'

const DB = process.env.DATABASE_URL
const KEY = process.env.STRIPE_SECRET_KEY

if (!DB) {
  console.error('❌ DATABASE_URL não está no ambiente.')
  console.error('   Rode assim:  bun run:dev scripts/stripe-sync-courses.ts')
  process.exit(1)
}
if (!KEY) {
  console.error('❌ STRIPE_SECRET_KEY não está no ambiente. Preencha o .env.local.')
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

/** `--adopt <courseId>=price_...` — liga o curso a um Price que **já existe** no Stripe. */
const adopted = new Map<string, string>()
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--adopt') continue
  const pair = args[i + 1] ?? ''
  const [courseId, ref] = pair.split('=')
  if (!courseId || !ref?.startsWith('price_')) {
    console.error(`❌ --adopt esperava courseId=price_..., recebeu "${pair}"`)
    process.exit(1)
  }
  adopted.set(courseId, ref)
}

const pool = new Pool({ connectionString: DB })
const stripe = new Stripe(KEY)

const PROVIDER = 'stripe'
const CURRENCY = 'brl'

type CourseRow = { id: string; title: string; priceCents: number }
type LinkRow = { id: string; providerPriceId: string }

async function sync() {
  const client = await pool.connect()

  try {
    const { rows: courses } = await client.query<CourseRow>(
      `SELECT id, title, "priceCents" FROM course
        WHERE "priceCents" IS NOT NULL AND "priceCents" > 0
        ORDER BY "order" ASC`,
    )

    if (!courses.length) {
      console.log('Nenhum curso com preço. Defina em /admin/courses/<id> → "Preço da compra avulsa".')
      return
    }

    for (const course of courses) {
      const { rows: existing } = await client.query<LinkRow>(
        `SELECT id, "providerPriceId" FROM "courseProviderPrice"
          WHERE "courseId" = $1 AND provider = $2 AND active = true LIMIT 1`,
        [course.id, PROVIDER],
      )
      const current = existing[0]

      // o Product a reaproveitar quando só o valor mudou
      let productId: string | undefined

      if (current) {
        const price = await stripe.prices.retrieve(current.providerPriceId)
        if (price.unit_amount === course.priceCents) {
          console.log(`• ${course.id}: já ligado a ${current.providerPriceId} — pulado`)
          continue
        }
        productId = typeof price.product === 'string' ? price.product : price.product.id
        console.log(
          `• ${course.id}: preço mudou (${price.unit_amount} → ${course.priceCents}); ` +
            `aposentando ${current.providerPriceId}`,
        )
      }

      const adoptRef = adopted.get(course.id)
      if (adoptRef) {
        // confere antes de gravar: adotar um Price que não bate criaria divergência
        // silenciosa entre o que a tela mostra e o que o cartão é cobrado
        const price = await stripe.prices.retrieve(adoptRef)
        const problems: string[] = []
        if (price.unit_amount !== course.priceCents) {
          problems.push(`valor ${price.unit_amount} ≠ priceCents ${course.priceCents}`)
        }
        if (price.currency !== CURRENCY) problems.push(`moeda ${price.currency} ≠ ${CURRENCY}`)
        if (price.recurring) {
          problems.push(`curso é compra única mas o Price é recorrente (${price.recurring.interval})`)
        }
        if (problems.length) {
          console.error(`❌ ${course.id}: não adotei ${adoptRef} —`)
          for (const p of problems) console.error(`     ${p}`)
          continue
        }
        if (dryRun) {
          console.log(`[dry-run] ${course.id}: adotaria ${adoptRef}`)
          continue
        }
        await link(client, course.id, adoptRef, current)
        console.log(`✓ ${course.id}: adotado ${adoptRef}`)
        continue
      }

      if (dryRun) {
        console.log(
          `[dry-run] ${course.id}: ${productId ? `novo Price em ${productId}` : `criaria Product "${course.title}" e Price`} ` +
            `${course.priceCents} ${CURRENCY.toUpperCase()}`,
        )
        continue
      }

      if (!productId) {
        const product = await stripe.products.create(
          {
            name: course.title,
            // o caminho de volta: do painel do Stripe para o nosso curso
            metadata: { courseId: course.id },
          },
          { idempotencyKey: `product-course-${course.id}` },
        )
        productId = product.id
      }

      const price = await stripe.prices.create(
        {
          product: productId,
          unit_amount: course.priceCents,
          currency: CURRENCY,
          metadata: { courseId: course.id },
        },
        { idempotencyKey: `price-course-${course.id}-${course.priceCents}` },
      )

      await link(client, course.id, price.id, current)
      console.log(`✓ ${course.id}: ${productId} / ${price.id}`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

/** Aposenta o preço atual (se houver) e grava o novo — numa transação só. */
async function link(
  client: import('pg').PoolClient,
  courseId: string,
  priceId: string,
  previous: LinkRow | undefined,
) {
  await client.query('BEGIN')
  try {
    if (previous) {
      await client.query(`UPDATE "courseProviderPrice" SET active = false WHERE id = $1`, [
        previous.id,
      ])
    }
    await client.query(
      `INSERT INTO "courseProviderPrice" (id, "courseId", provider, "providerPriceId", active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT ("providerPriceId") DO UPDATE SET active = true`,
      [`cpp-${crypto.randomUUID()}`, courseId, PROVIDER, priceId],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  }
}

sync().catch((err) => {
  console.error('❌ falhou:', err instanceof Error ? err.message : err)
  process.exit(1)
})
