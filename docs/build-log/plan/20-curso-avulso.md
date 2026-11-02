# Fase 20 — Curso avulso

**Status:** ✅ entregue (01/11/2026) — [handoff](../handoffs/20-curso-avulso.md) · **Pré-requisito humano:** conta Stripe já configurada (a mesma
da Fase 11; test mode basta) · **Depende de:** 19 (a compra termina numa matrícula)

## Objetivo

Vender um curso fora da assinatura — para quem não assina, e para quem assina mas quer um
curso anterior à assinatura dele.

## Por que esta fase existe

A Fase 19 criou o estado `needs-purchase` e o botão que o anuncia. Esta fase faz o botão
cobrar.

🔴 **Nada de gateway novo.** Tudo aqui é o caminho que a Fase 11 já abriu para plano
avulso (`interval: 'once'`), com `courseId` no lugar de `planId`. Se algum passo parecer
exigir um desenho diferente do que `providers/stripe.ts` já faz, pare e releia — é sinal
de estar escrevendo a segunda implementação.

## Escopo

### 1. Schema

```ts
// público
course { priceCents: integer('priceCents') }   // null = não vende avulso

// privado (src/database/schema-private.ts)
payment { courseId: text('courseId').references(() => course.id) }   // nullable

courseProviderPrice = pgTable('courseProviderPrice', {
  id, courseId → course (cascade),
  provider: text().notNull(),
  providerPriceId: text().notNull(),
  active: boolean().notNull().default(true),
  createdAt,
}, (t) => [
  uniqueIndex('courseProviderPrice_providerPriceId_uidx').on(t.providerPriceId),
  index('courseProviderPrice_courseId_provider_idx').on(t.courseId, t.provider),
])
```

`courseProviderPrice` é cópia estrutural de `planProviderPrice`, e pelas mesmas três
razões escritas lá: `course` é público e `price_id` não tem o que fazer nele; a decisão 4
do `STATE` é pagamento abstraído; e **Price no Stripe é imutável** — mudar o preço cria
outro, o antigo fica `active = false` porque quem já comprou aponta para ele.

⚠️ `payment.courseId` é o elo que **não** pode morar em `enrollment`: `payment` é privada
(invariante 1) e `enrollment` é pública.

### 2. O `subject` do checkout

`CheckoutRequest` ([`src/features/billing/types.ts`](../../../src/features/billing/types.ts))
troca `planId: string` por:

```ts
subject: { kind: 'plan'; planId: string } | { kind: 'course'; courseId: string }
```

União marcada, não dois campos opcionais: com `planId?` e `courseId?` existe o estado
"nenhum dos dois" e o "os dois", e alguém vai ter que decidir o que fazer com eles em
runtime. O compilador resolve isso de graça.

Toca: `types.ts`, `providers/stripe.ts`, `providers/manual.ts`, `providers/generic.ts`,
`app/api/billing/checkout+api.ts` e `src/features/billing/client/billingApi.ts`.

### 3. `createCheckout` com curso

Em [`providers/stripe.ts`](../../../src/features/billing/providers/stripe.ts), o curso cai
**no ramo que já existe** para plano avulso:

- `mode: 'payment'` (não `subscription`) — é o mesmo `isOneTime` de hoje;
- `line_items` com o `providerPriceId` resolvido de `courseProviderPrice`;
- `metadata: { userId, courseId }` **na sessão e em `payment_intent_data.metadata`**. O
  comentário no arquivo explica por quê, e vale igual aqui: são os dois objetos que geram
  evento, e sem o segundo o primeiro webhook funciona e os seguintes caem em `ignored` sem
  erro nenhum;
- 🔴 **sem `subscription_data`**: curso comprado não cria assinatura e não renova.

O `success_url` pode levar ao curso (`/home/courses/<slug>?compra=ok`) em vez do feed —
quem comprou quer entrar nele.

### 4. Webhook → matrícula

[`stripeEvents.ts`](../../../src/features/billing/providers/stripeEvents.ts) já traduz
`checkout.session.completed` e `payment_intent.succeeded`. Acrescente `courseId` ao evento
`payment.succeeded` quando o metadata o trouxer.

⚠️ **A regra de não contar duas vezes continua valendo.** `payment_intent.succeeded` é
ignorado quando o intent tem `invoice` — compra de curso não tem fatura, então ela passa.
Não relaxe essa checagem: foi ela que evitou inflar o faturamento do `/admin/people`.

Quem grava: `subscriptionActions.ts` (ou um irmão `courseActions.ts`, se ficar mais
legível) numa transação só —

1. `payment` com `courseId`, `amountCents`, `providerPaymentId` (idempotente pelo
   `providerPaymentId`, como já é hoje: pagamento reenviado devolve `duplicate`);
2. `enrollment` com `source: 'purchase'`, `subscriptionId: null`.

🔴 **Matrícula de compra nunca é revogada** por fim de assinatura — é a decisão travada da
Fase 19, e o `revokeEnrollmentsForSubscription` só toca `source = 'subscription'`. Um
teste tem que guardar isso.

### 5. Script de preço

`scripts/stripe-sync-courses.ts`, irmão de
[`stripe-sync-plans.ts`](../../../scripts/stripe-sync-plans.ts) — leia aquele antes de
escrever este; ele já resolve Product por item, `--dry-run`, `--adopt <id>=<price>` e
idempotência.

**Um Product por curso**, pelo mesmo motivo: o nome do Product é o que aparece no line
item do Checkout e na fatura.

### 6. Telas

**Admin — curso**: campo de preço no bloco "Quem tem acesso" da Fase 19. Formate com
`formatPrice.ts`, que já existe. Avisar quando `subscriberAccess = 'none'` e
`priceCents` for nulo: o curso fica **inalcançável** para todo mundo que não é o criador.

**Aluno — detalhe do curso**: o botão `needs-purchase` ganha o preço ("Comprar este curso
— R$ 97") e chama o checkout. Reaproveite `startCheckout`/`goToGateway`/`billingMessage`
de [`billingApi.ts`](../../../src/features/billing/client/billingApi.ts); a tela
`/assinar` é o modelo de tratamento de erro e de estado "abrindo".

⚠️ **No app nativo o checkout abre navegador externo.** Já é assim para assinatura; o
retorno tem que voltar funcionando (é item do roteiro da Fase 15).

## Qualidade e teste

**Reaproveitar, nominalmente:** todo o `src/features/billing/` — `registry`,
`CheckoutResult`, `billingApi`, `formatPrice`, `webhookSignature`, e o desenho de
`planProviderPrice` e `stripe-sync-plans.ts`.

**Funções puras com teste:** a tradução do evento já é pura e tem
`src/test/unit/stripe-events.test.ts` — **estenda aquele arquivo** com os casos de curso.
Mínimo: PaymentIntent com `courseId` e sem `invoice` → `payment.succeeded` com curso;
PaymentIntent com `invoice` → `ignored` (a regra do duplo); sessão sem metadata →
`ignored`, não exceção.

**Prova no Postgres:** uma compra tem que deixar **três** fatos — `payment` com
`courseId`, `enrollment` com `source: 'purchase'`, e nenhuma linha nova em
`subscription`.

**Roteiro de ponta a ponta no Stripe test mode**, porque é a lacuna que as Fases 11 a 13
deixaram: `scripts/billing-smoke.ts` é o lugar de acrescentar os casos, e ele já tem 12.

**Sem `any` em código novo.**

## Verificação

1. `bun run:dev scripts/stripe-sync-courses.ts --dry-run` e depois sem a flag; conferir
   `select * from "courseProviderPrice"`
2. Curso com `subscriberAccess = 'none'` e preço; entrar como **Assinante** → o botão diz
   "Comprar este curso — R$ X"
3. Comprar com o cartão de teste `4242 4242 4242 4242`
4. No banco: `payment` com `courseId` e `status = 'paid'`; `enrollment` com
   `source = 'purchase'`; `select count(*) from subscription` **inalterado**
5. Abrir uma aula do curso comprado: toca
6. Revogar a assinatura do Assinante → a matrícula de **compra** continua ativa e a aula
   continua tocando
7. Reenviar o mesmo webhook pelo painel do Stripe → nada duplica (`duplicate`)
8. `bun check types` limpo · `bun test:unit` passando · `scripts/billing-smoke.ts` verde
9. **Comitar a versão funcionando**, com "Conhecido e NÃO resolvido"

## Não é desta fase

- **Reembolso.** 🔴 Continua sendo o furo mais antigo da base: `charge.refunded` não é
  tratado, `BillingProvider` não tem `refund` e `payment` não tem coluna de estorno —
  então estorno feito no painel do Stripe não chega ao app, o faturamento segue contando
  e o acesso continua liberado. **Merece fase própria**, e esta fase piora o problema ao
  criar um segundo tipo de compra
- **Tela de faturamento** (receita, MRR, por plano, por curso)
- **Cupom e promoção** — `allow_promotion_codes` está `false` por decisão da Checkout
  Studio
- **Combo / trilha de cursos**
- **IAP de iOS** — ver "Não é desta fase" da Fase 15
