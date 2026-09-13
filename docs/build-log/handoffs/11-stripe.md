# Handoff 11 — Stripe

## Objetivo

Trocar `BILLING_PROVIDER=manual` por `stripe` e fazer o ciclo de cobrança fechar de ponta a
ponta no servidor.

## Feito

| arquivo | o quê |
|---|---|
| `src/features/billing/providers/stripe.ts` | **novo** — Checkout Session (`hosted_page`), Customer reaproveitado, cancelamento e verificação de webhook |
| `src/features/billing/providers/stripeEvents.ts` | **novo** — tradução dos eventos para `BillingEvent`. Função pura: só `import type`, nada de env nem SDK em runtime |
| `src/features/billing/server/revokeSubscription.ts` | **novo** — cancela no gateway **antes** de escrever no banco |
| `src/features/billing/registry.ts` | uma linha registrando o provider |
| `src/database/schema-private.ts` | `billingCustomer` e `planProviderPrice` |
| `src/database/schema-public.ts` | `plan.interval` ganhou `'once'`; coluna `plan.accessDays` |
| `src/data/models/plan.ts` | o mesmo, no lado do Zero |
| `app/api/admin/people+api.ts` | `revoke` passou a usar `revokeSubscription` |
| `scripts/stripe-sync-plans.ts` | **novo** — liga `plan` a Price do Stripe, com `--adopt` e `--dry-run` |
| `scripts/seed-courses.ts` | catálogo real, e `ON CONFLICT DO UPDATE` para convergir |
| `src/test/unit/stripe-events.test.ts` | **novo** — 17 casos |
| `package.json` · `src/server/env-server.ts` | `stripe@22.6.2`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_PROVIDER=stripe` |
| `STRIPE_INTEGRATION_TODO.md` | **novo** — setup, eventos do webhook, cartões de teste |

Validado: `bun check types` limpo · **111 testes** (era 92) · migration aplicada, publication
seguiu com **13 tabelas** (as duas novas são privadas) · `on-zero generate` → 13 models,
**18 queries**, 44 mutations · sync adotou os dois preços do sandbox.

## Decisões

1. **`planProviderPrice` é tabela, não coluna em `plan`.** Price no Stripe é **imutável**:
   mudar valor cria outro. Com `active` na linha, o preço velho sobrevive porque assinatura
   vendida ainda aponta pra ele — é a decisão 16 aplicada ao gateway. E `plan` é público e
   sincronizado; `price_id` não tem o que fazer lá.
2. **Metadata em dois lugares no recorrente.** Os eventos `customer.subscription.*` carregam
   o metadata **da assinatura**, não o da sessão. Só na sessão, o primeiro evento passa e
   todos os seguintes viram `ignored` — sem erro nenhum, que é o pior modo de falhar.
3. **Compra avulsa (`interval: 'once'`) não é trial do Stripe.** É `mode: 'payment'`, sem
   Subscription do outro lado. O acesso vira `subscription` com
   `currentPeriodEnd = agora + plan.accessDays` e **depende do cron para vencer**. Sem
   `accessDays`, avulso viraria vitalício em silêncio.
4. **O prazo do avulso é preenchido no `parseWebhook`, não no mapeador.** O mapeador é puro
   de propósito (testável sem env nem banco), e `accessDays` está no Postgres. Há um teste
   que falha se alguém mover isso.
5. **`payment_intent.succeeded` com `invoice` é ignorado.** Assinatura dispara ele *e*
   `invoice.paid` pelo mesmo dinheiro, com ids diferentes — e como `recordPayment`
   deduplica por `providerPaymentId`, o id diferente passaria e contaria duas vezes.
6. **Revogar ≠ cancelar.** `cancelSubscription` (write puro) é o que o **webhook** usa: ali o
   Stripe já cancelou. `revokeSubscription` é o que o **admin** usa, e chama o gateway
   primeiro — se o Stripe falhar, **nada** é escrito e sobe 502. A ordem é a decisão:
   marcar `canceled` aqui e falhar lá deixaria o cliente sem acesso e com a fatura correndo.
   Arquivo separado também porque `subscriptionActions` → `registry` → `manual` →
   `subscriptionActions` é ciclo de import.
7. **O provider vem da linha, nunca de `activeProvider()`.** Assinatura concedida à mão
   continua `manual` depois de o Stripe entrar; mandá-la para o Stripe pediria cancelamento
   de um id que não existe lá.
8. **`'once'` no enum não precisou de `ALTER TYPE`** — decisão 6 (enum é coluna `text`).
   A única coluna nova em `plan` é `accessDays`.
9. **`plan-anual` saiu de venda, não foi apagado** (decisão 16): `p-cac` em
   `seed-posts.ts` tem `requiredPlanId = 'plan-anual'`.

## Catálogo

| `plan` | intervalo | preço | Stripe |
|---|---|---|---|
| `plan-trial` — "Avulso" | `once`, 30 dias | R$ 10,00 | `prod_VFW6CAlayZiEO2` / `price_1UF14I…` |
| `plan-mensal` — "Mensal" | `month` | R$ 10,00 | `prod_VFW5Pqq3eST6Xr` / `price_1UF13C…` |
| `plan-anual` | `year` | — | fora de venda |

## Comandos (já rodados, nesta ordem)

```bash
bun install && bun backend
bunx on-zero generate      # não `bun zero:generate`: o --after 'bun lint:fix' entra em panic
bun run:dev scripts/seed-courses.ts
bun run:dev scripts/stripe-sync-plans.ts --adopt plan-trial=prod_VFW6CAlayZiEO2 --adopt plan-mensal=prod_VFW5Pqq3eST6Xr
bun test:unit
```

Falta um, agora que `BILLING_PROVIDER` mudou:

```bash
bun env:update
```

## Não feito

- 🔴 **Ninguém agendou `/api/cron/expire-subscriptions`.** Era pendência antes desta fase e
  ficou — mas agora **pesa mais**: o avulso depende dele para vencer. Sem agendador, quem
  comprar os R$ 10 avulsos fica com acesso para sempre.
- **Customer Portal não foi escrito.** `stripe.billingPortal.sessions.create` entregaria
  troca de cartão, faturas e cancelamento sem construir tela. A Fase 13 conta com isso.
- **Nada foi exercido em runtime contra o Stripe.** Typecheck e teste de unidade passam, e o
  sync falou com a API de verdade — mas **nenhuma compra foi feita**, nenhum webhook chegou,
  e o `revokeSubscription` nunca cancelou nada lá. É a mesma classe de buraco que o CORS do
  R2 na Fase 5: o que não foi exercido não está provado.
- **Pix não entrou** — cartão só. Pix recorrente precisa ser confirmado no Stripe.
- **Stripe Tax desligado** e nota fiscal não existe. Registrado no `STRIPE_INTEGRATION_TODO.md`.

## Contrato para a próxima fase

- `POST /api/billing/checkout` com `{ planId, returnUrl? }` devolve
  `{ provider: 'stripe', kind: 'redirect', url }`. Erros: 401, 404 `plan-not-found`,
  422 `plan-inactive`, 500 `checkout-failed`.
- ⚠️ **No nativo, mande `returnUrl`** com o esquema do app (`bubble://`, `app.config.ts:62`).
  Sem ele o retorno cai em `BETTER_AUTH_URL` e o usuário paga e fica preso no navegador.
- `plan` agora tem `interval: 'month' | 'year' | 'once'` e `accessDays`. A tela de preços
  precisa tratar os três — "R$ 10,00 / mês" e "R$ 10,00 · 30 dias" não são a mesma frase.
- `activeSubscription` continua sendo a query certa para o estado; `status` pode vir
  `past_due`, e **`past_due` já corta o acesso** (`ACTIVE_SUBSCRIPTION_STATUSES` é só
  `active` e `trialing`). ⚠️ O `plan/13-funil-assinatura.md` diz o contrário num ponto —
  corrigir ao executar.
