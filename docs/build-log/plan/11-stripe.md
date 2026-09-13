# Fase 11 — Stripe (o gateway de verdade)

**Status:** ⬜ pendente · **Pré-requisito humano:** conta Stripe (test mode basta para
construir a fase inteira — ver "Custo zero até faturar")

## Objetivo

Trocar `BILLING_PROVIDER=manual` por `stripe` e fazer o ciclo fechar: o usuário paga, o
webhook escreve `subscription`, o gate da Fase 4 libera o conteúdo, e cancelar para a
cobrança **do lado do Stripe**, não só no nosso banco.

Fase de servidor. Nenhuma tela — a UI é a Fase 12. Prova-se por Stripe CLI e `SELECT`.

## Por que Stripe, e por que agora

Decisão do usuário (12/09/2026), depois de comparar com IAP das lojas. O raciocínio, para
não se perder: no Brasil, desde 18/06/2026, a Apple permite link externo de pagamento —
mas cobra 10–15% mesmo assim. A web cobra só o gateway (~4%). Então **web é o canal
principal** e loja é conveniência para depois; a Fase 14 trata disso.

Stripe em pessoa física com **CPF** é aceito (não exige CNPJ nem MEI). ⚠️ O tipo de conta
e o CPF/CNPJ **não podem ser trocados depois de verificados** — se a intenção é faturar
por empresa algum dia, abra já como empresa.

## Custo zero até faturar

**Test mode funciona antes de qualquer verificação de conta.** Chave `sk_test_`, cartões
de teste e a Stripe CLI encaminhando webhook para o localhost: a fase inteira se constrói
e se prova sem conta verificada e sem custo. A verificação (CPF, conta bancária) só é
necessária para receber dinheiro de verdade.

## O que já existe — e é mais do que parece

Esta fase é **um provider novo, uma migration e uma correção**, não uma construção. A
Fase 9 deixou tudo montado:

| peça | onde | estado |
|---|---|---|
| contrato do adapter | `src/features/billing/types.ts` | ✅ `createCheckout` / `cancel` / `parseWebhook` |
| exemplo a copiar | `src/features/billing/providers/generic.ts` | ✅ é a referência de forma |
| registro | `src/features/billing/registry.ts` | ✅ acrescentar **uma linha** |
| rota de checkout | `app/api/billing/checkout+api.ts` | ✅ já lê a sessão, valida o plano e recusa `manual` com 501 |
| rota de webhook | `app/api/billing/webhook/[provider]+api.ts` | ✅ já faz `request.text()` — o **corpo cru**, que é o que o Stripe assina |
| escritas de assinatura | `src/features/billing/server/subscriptionActions.ts` | ✅ `grantSubscription`, `setSubscriptionStatus`, `recordPayment` (com dedupe), `findSubscription` |
| job de expiração | `app/api/cron/expire-subscriptions+api.ts` | ✅ existe e é protegido por `CRON_SECRET` — ⚠️ **ninguém o chama** |

O webhook já resolve criar-ou-atualizar e já devolve `duplicate` em pagamento reenviado.
Não reescreva nada disso.

## Escopo

### 1. Migration: duas tabelas privadas

Em **`src/database/schema-private.ts`**, ao lado de `payment` — são as duas pontas que
ligam o nosso catálogo agnóstico ao vocabulário do Stripe:

| tabela | colunas | por quê |
|---|---|---|
| `billingCustomer` | `userId`, `provider`, `customerId`, única em `(userId, provider)` | reusar o mesmo Stripe Customer por pessoa. Sem isso cada assinatura nasce num customer novo e o histórico do cliente se estilhaça — e o Customer Portal (item 4) deixa de fazer sentido |
| `planProviderPrice` | `planId`, `provider`, `providerPriceId`, `active`, única em `(planId, provider, providerPriceId)` | o `price_id` do Stripe de cada plano |

**Por que tabela de mapeamento, e não `plan.providerPriceId`:**

1. **`plan` é público e sincronizado pelo Zero**; `price_id` do Stripe é encanamento de
   gateway que o cliente nunca precisa ver. Coluna nova em tabela publicada exigiria
   `bun zero:generate` e um model regenerado para carregar um dado que a tela ignora.
2. **A decisão 4 do `STATE` é pagamento abstraído.** Um `stripe_` no schema público
   amarraria o catálogo a um gateway; o mapeamento por linha atravessa a troca de gateway
   sem tocar em `plan`.
3. **Preço muda por versionamento, não por `UPDATE`** — e é aqui que a tabela ganha da
   coluna. No Stripe, Price é imutável: mudar valor é criar Price novo. Quem já assina
   continua no antigo (é o grandfathering que a decisão 16 já insinua ao nunca apagar
   plano), e o novo vale para quem entra. Com uma coluna só, isso viraria perda de
   histórico; com `active` na linha, os dois Prices coexistem e a intenção fica legível.

⚠️ **Não use `price_data` inline no Checkout.** Funciona (`mode: subscription` aceita
`recurring` inline) e dispensaria esta migration, mas cria um Price avulso por checkout:
o relatório por preço no painel do Stripe vira lixo, cupom e Stripe Tax ficam mais
difíceis, e não existe mais "o preço que aquele assinante contratou". O atalho custa
depois.

ℹ️ As duas tabelas em `schema-private.ts` ficam **fora da publication do Zero** — logo,
sem model novo, sem `zero:generate` e sem reconstruir o replica (a armadilha que a Fase 4
pagou). Só `bun backend`, que roda `migrate:build` antes.

### 2. `scripts/stripe-sync-plans.ts`

Idempotente, no formato dos `seed-*.ts`: para cada `plan` ativo sem `planProviderPrice`,
cria Product + Price no Stripe (a partir de `priceCents`, `currency`, `interval`) e grava
o mapeamento. Rodar de novo não duplica.

Um script, e não um POST dentro do form de planos do admin, por duas razões: o criador não
precisa abrir o painel do Stripe, **e** a chamada ao gateway fica fora do caminho de
request — plano salvo com Stripe fora do ar não pode virar plano meio-criado. Integrar ao
form é refinamento posterior, com o mapeamento já existindo.

### 3. `src/features/billing/providers/stripe.ts`

Use o **SDK oficial** (`stripe`), não `fetch` à mão. O R2 foi escrito à mão porque SigV4
por query string não tem SDK leve que sirva; aqui o SDK dá verificação de webhook correta,
tipos, tratamento de erro por classe e versionamento de API. Import **server-only** — o
`vite.config.ts` já está no alvo Node, e Checkout é redirect, então `@stripe/stripe-js`
no cliente **não** é necessário.

**`createCheckout`** — resolve (ou cria) o `billingCustomer`, monta Checkout Session em
`mode: 'subscription'` com o `price` do `planProviderPrice`, devolve
`{ kind: 'redirect', url }`. Passe **idempotency key** nas escritas: duplo clique no botão
de assinar não pode virar duas assinaturas.

🔴 **A armadilha que vai custar horas se for ignorada: o `metadata` tem que ir em
`subscription_data.metadata`, não (só) no da sessão.** O webhook precisa de `userId` e
`planId` para criar a assinatura na primeira notícia (ver o `if (!event.userId ||
!event.planId)` da rota). Os eventos `customer.subscription.*` carregam o metadata **da
assinatura**, não o da sessão — pôr só na sessão faz o primeiro evento funcionar e todos
os seguintes caírem em `ignored`, sem erro nenhum. Ponha nos dois.

**`cancel`** — dois caminhos, com intenções diferentes, e o código tem que dizer qual é
qual:

- **usuário cancelando**: `cancel_at_period_end: true` — ele fica com o que pagou. É o que
  a coluna `subscription.cancelAtPeriodEnd` já esperava e nunca ninguém escreveu.
- **admin revogando** (abuso, estorno): cancelamento imediato.

**`parseWebhook`** — `stripe.webhooks.constructEvent` com o `STRIPE_WEBHOOK_SECRET`.

🔴 **`verifyHmac` do projeto não serve aqui.** O Stripe assina `${timestamp}.${rawBody}` e
manda em `Stripe-Signature` como `t=...,v1=...`; o `verifyHmac` assina só o corpo. O SDK
já confere a janela de tempo do `t` — que é o que impede replay de um corpo assinado
antigo. Converta a exceção do SDK em `WebhookSignatureError`: a rota já traduz isso em 401.

Tradução mínima de eventos:

| evento Stripe | `BillingEvent` |
|---|---|
| `checkout.session.completed` | `subscription.updated`, status `active` |
| `customer.subscription.updated` | `subscription.updated` com o status mapeado |
| `customer.subscription.deleted` | `subscription.updated`, status `canceled` |
| `invoice.paid` | `payment.succeeded` (`amount_paid`, `currency`, id da invoice) |
| `invoice.payment_failed` | `subscription.updated`, status `past_due` |
| qualquer outro | `{ type: 'ignored' }` — a rota devolve 200 de propósito |

⚠️ **`invoice.paid` pode chegar antes de `checkout.session.completed`.** Resolva o `userId`
pelo metadata que vem em `subscription_details` da invoice, e não só por
`findSubscription` — senão o primeiro pagamento entra órfão e `GET /api/admin/people` soma
errado.

⚠️ **O Stripe reenvia evento.** `recordPayment` já deduplica por `providerPaymentId`;
mantenha `providerPaymentId` = id da invoice (estável no reenvio), nunca algo gerado aqui.

### 4. Customer Portal — e o que ele apaga da Fase 12

`stripe.billingPortal.sessions.create` devolve URL de uma página hospedada onde o
assinante troca cartão, vê faturas e cancela. Uma rota (`/api/billing/portal`) substitui
três telas que a Fase 12 teria que construir, e o cancelamento volta pelo webhook
(`customer.subscription.updated` com `cancel_at_period_end`) sem escrita especial.

O que **não** sai do app: mostrar o estado da assinatura. Isso o Zero já sincroniza
(`activeSubscription`), e é a Fase 12.

### 5. Corrigir o `cancelSubscription` — é bug de dinheiro

`src/features/billing/server/subscriptionActions.ts:117` só faz `UPDATE
status='canceled'` e **nunca chama `provider.cancel()`**. Com `manual` isso era correto
(não há gateway do outro lado). Com Stripe, revogar pelo admin corta o acesso e **segue
cobrando o cliente todo mês**.

Chame o provider de dentro do `cancelSubscription`. São duas chamadas em dois sistemas sem
transação distribuída: escreva no código **qual dos dois é a verdade quando discordarem**,
e faça a falha do gateway chegar a quem clicou em vez de ser engolida — assinatura
`canceled` aqui e ativa no Stripe é o pior dos dois mundos.

### 6. Agendar `/api/cron/expire-subscriptions`

A rota existe e nada a chama. Sem isso, assinatura vencida **continua liberando
conteúdo** — o gate filtra por `status`, nunca por data (de propósito: comparar com
"agora" dentro de query sincronizada daria resultado diferente no cliente e no servidor).

Uma vez por dia basta. Cron do host na Lightsail (`curl` com o `CRON_SECRET`) é o mais
simples, já que o app roda em container em máquina nossa. Escreva no
`deploy/aws/README.md` junto dos containers, senão isso se perde no primeiro redeploy.

ℹ️ Com Stripe, `customer.subscription.deleted` já cobre a expiração normal. O job passa a
ser rede de segurança para webhook perdido — que é justamente quando não se pode confiar
no gateway.

### 7. Variáveis de ambiente

Duas novas: `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`.

🔴 **Uma variável mora em UM arquivo só** (invariante 8). Na ordem:

1. `package.json` → bloco `env`, as duas com `""` de default
2. `bun env:update` — reescreve o miolo entre os marcadores `🔒` de
   `src/server/env-server.ts` **e** o bloco de secrets do `.github/workflows/ci.yml`
3. valor real (`sk_test_...`, `whsec_...`) em **`.env.local`**, que não é versionado
4. `BILLING_PROVIDER=stripe` — hoje em `.env:22`, que é **gerado**: trocar no
   `package.json` e rodar `bun env:update` de novo
5. registrar as duas no índice do `.env.local.example`

## Verificação

**Prove o webhook antes do checkout.** É o caminho que decide acesso, e o que `curl`
alcança sem navegador.

1. `bun backend` — a migration das duas tabelas privadas aplica (sai 0)
2. `bun run:dev scripts/stripe-sync-plans.ts` → cada plano ativo ganha
   `planProviderPrice`; rodar de novo não duplica
3. `stripe login` e `stripe listen --forward-to
   localhost:8081/api/billing/webhook/stripe` — a CLI imprime o `whsec_` do túnel, que é o
   que vai no `.env.local` em dev
4. `stripe trigger checkout.session.completed` → 200, e `SELECT * FROM subscription` mostra
   a linha com `provider = 'stripe'` e `providerSubscriptionId` preenchido
5. Corpo com assinatura errada → **401** `bad-signature`. Sem isso a base de assinaturas
   está aberta a quem descobrir a URL
6. Reenviar o mesmo `invoice.paid` → o segundo volta `duplicate`, e `payment` tem **uma**
   linha
7. `POST /api/billing/checkout` logado, com `planId` ativo → 200 com `{ kind: 'redirect',
   url }`; pagar com `4242 4242 4242 4242`; conferir que o conteúdo pago aparece para
   aquele usuário
8. Cancelar pelo admin → `canceled` **no nosso banco e no painel do Stripe**. Confira no
   painel, não só no `SELECT`: é exatamente o bug que o item 5 conserta
9. `bun check types` limpo e `bun test:unit` passando. Teste de unidade do mapeamento de
   evento é obrigatório; o da verificação de assinatura também, mesmo delegando ao SDK —
   o que se testa é que a exceção vira `WebhookSignatureError` e que a rota responde 401

🔴 **O que teste por Node não pega.** A rota devolve URL do Stripe; o redirect real só se
prova no navegador — mesma lição do upload para o R2 na Fase 5, onde o `media-smoke.ts`
passava por Node enquanto o navegador quebrava no CORS. O clique fica para a Fase 12; esta
fase prova tudo menos o redirect.

## Não é desta fase

- **Tela de assinar, estado da assinatura, teaser de conteúdo bloqueado** → Fase 12
- **Pix.** Cartão primeiro: recorrência por cartão é caminho batido no Stripe. Pix
  recorrente ("Pix Automático") precisa ser confirmado no Stripe antes de entrar em
  qualquer plano — não assuma que existe
- **Nota fiscal.** Venda de infoproduto no Brasil exige NF; nem Stripe nem este repo
  emitem. Fica registrado como pendência de negócio, não de código
- **IAP das lojas** → a Fase 14 decide se entra
