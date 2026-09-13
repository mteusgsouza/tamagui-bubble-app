# Stripe — o que falta

Integração de **Checkout hospedado** (`ui_mode: 'hosted_page'`), com dois modos: assinatura
recorrente (`mode: 'subscription'`) e compra avulsa (`mode: 'payment'`). Este arquivo é a
fonte única do que ainda precisa ser feito.

Cenário detectado: **A** — já existia uma chamada de Checkout Session no repo
([src/features/billing/providers/stripe.ts](src/features/billing/providers/stripe.ts)),
então só os parâmetros dela foram conferidos contra a Checkout Studio. Nenhuma rota nova
foi criada: `/api/billing/checkout` e `/api/billing/webhook/[provider]` já existiam.

## Values to Replace

Os valores abaixo ainda não estão prontos para produção.

**Arquivos com pendência:**
- [src/features/billing/providers/stripe.ts](src/features/billing/providers/stripe.ts)

| Field | Current Value | What to Set |
|-------|---------------|-------------|
| `line_items[].price` | lido de `planProviderPrice` — **a tabela está vazia até você rodar o sync** | `bun run:dev scripts/stripe-sync-plans.ts --adopt plan-trial=prod_VFW6CAlayZiEO2 --adopt plan-mensal=prod_VFW5Pqq3eST6Xr`. Sem isso, `createCheckout` lança `O plano <id> não tem preço no Stripe` |
| `success_url` | `{base}/home/feed?checkout=success&session_id={CHECKOUT_SESSION_ID}` | Aponta para o feed porque `/assinar` ainda não existe (é a Fase 13). Mantenha o template `{CHECKOUT_SESSION_ID}` |
| `cancel_url` | `{base}/home/feed?checkout=cancel` | Idem — deve virar `/assinar` quando a tela existir |
| `mode` | `subscription` | ✅ correto para cobrança recorrente. Não mexer |

⚠️ **No nativo, `base` precisa ser deep link.** `createCheckout` usa o `returnUrl` que o
chamador passar e só cai em `BETTER_AUTH_URL` quando não vem nada. O app tem
`scheme: 'bubble'` ([app.config.ts](app.config.ts)), então a tela nativa da Fase 13 tem
que mandar o esquema — senão o usuário paga e fica preso no navegador.

## Configured Parameters

Configurados na Checkout Studio e já aplicados exatamente como especificado.

**Arquivo:**
- [src/features/billing/providers/stripe.ts](src/features/billing/providers/stripe.ts)

| Parameter | Value |
|-----------|-------|
| `ui_mode` | `hosted_page` |
| `billing_address_collection` | `auto` |
| `phone_number_collection` | `{ enabled: false }` |
| `automatic_tax` | `{ enabled: false }` |
| `allow_promotion_codes` | `false` |
| `payment_method_collection` | `always` — **só em `mode: 'subscription'`**; o parâmetro não existe no avulso |
| `submit_type` | `auto` |
| `integration_identifier` | `hosted_mobile_app_0001` |
| `origin_context` | `mobile_app` |

ℹ️ `ui_mode: 'hosted_page'` é o valor para SDK ≥ 21.0.0. O `package.json` fixa
`stripe: ^22.6.0`, então está correto. Se algum dia o SDK cair abaixo de 21, o valor
passa a ser `hosted`.

### Três parâmetros mantidos que não estão na Checkout Studio

A regra do prompt manda remover parâmetros ausentes das Field Intents. **Estes três foram
mantidos de propósito** — são ligação com o domínio da aplicação, não opção de checkout:

| Parameter | Por que fica |
|-----------|--------------|
| `customer` | reaproveita o Stripe Customer da pessoa (`billingCustomer`). Sem ele, cada compra cria um customer novo e o Customer Portal deixa de fazer sentido |
| `metadata` | `{ userId, planId }` |
| `subscription_data.metadata` | **o que faz o webhook funcionar.** A rota `[provider]+api.ts` precisa de `userId`+`planId` para criar a assinatura na primeira notícia; os eventos `customer.subscription.*` carregam o metadata **da assinatura**, não o da sessão. Sem isto, o primeiro evento passa e todos os seguintes viram `ignored` sem erro |

Se preferir removê-los, a integração para de conseguir identificar quem comprou.

## O catálogo

Dois produtos, espelhados entre o Stripe e a tabela `plan`:

| `plan` | intervalo | preço | Stripe |
|---|---|---|---|
| `plan-trial` — "Avulso" | `once` (**não renova**), 30 dias de acesso | R$ 10,00 | `prod_VFW6CAlayZiEO2` |
| `plan-mensal` — "Mensal" | `month` | R$ 10,00 | `prod_VFW5Pqq3eST6Xr` |
| `plan-anual` | `year` | — | **fora de venda** (`active = false`) |

`plan-anual` veio do seed do repo, não do catálogo real. Ele **não é apagado** porque
`p-cac` (em `seed-posts.ts`) tem `requiredPlanId = 'plan-anual'` — é a decisão 16 do
`STATE`: plano sai de venda, nunca some.

**Como a compra avulsa funciona:** não existe Subscription do lado do Stripe, então
`checkout.session.completed` é a única notícia. O acesso não fica vitalício — vira uma
linha de `subscription` com `currentPeriodEnd = agora + plan.accessDays`, e quem derruba
depois é o `/api/cron/expire-subscriptions` (que **ainda não está agendado**, item 3).

ℹ️ Acrescentar `'once'` ao `interval` **não precisou de `ALTER TYPE`**: a decisão 6 do
`STATE` manda enum ser coluna `text`, nunca `pgEnum`. A única coluna nova em `plan` é
`accessDays`.

## Setup

Na ordem — cada passo depende do anterior:

### 1. Dependência

```bash
bun install
```

`stripe: ^22.6.0` foi adicionada ao `package.json`. Nenhuma chave publicável (`pk_`) é
necessária: Checkout hospedado é redirect, não roda JS do Stripe no cliente.

### 2. Variáveis de ambiente

```bash
bun env:update
```

Já foram declaradas no bloco `env` do `package.json` e propagadas para
[src/server/env-server.ts](src/server/env-server.ts) — o comando acima deve sair **sem
diff**, e serve de conferência.

Os valores reais vão em **`.env.local`** (não versionado):

```
STRIPE_SECRET_KEY=rk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

🔴 **Use chave restrita (`rk_`), não secreta (`sk_`).** Uma RAK só tem as permissões que
você der, então uma chave vazada faz muito menos estrago. Permissões mínimas aqui:
Checkout Sessions (write), Customers (write), Subscriptions (write), Products e Prices
(write, para cadastrar os planos).

🔴 **Chave nunca em código nem em arquivo versionado.** Em produção, o app roda em
container na Lightsail — o ideal é um cofre de segredos; no mínimo, `app.env` fora do git.
Vale configurar um hook de pre-commit que barre `sk_`/`rk_` no diff.

### 3. Migration e catálogo

```bash
bun backend
```

Gera e aplica a migration: `billingCustomer`, `planProviderPrice` e `plan.accessDays`.

```bash
bun zero:generate
```

Obrigatório — `plan` é tabela publicada e ganhou coluna. Sem regenerar, a query volta sem
o campo e a tela fica errada sem erro nenhum.

⚠️ Se o zero-cache reclamar de `Unknown table` no primeiro INSERT, o replica precisa ser
reconstruído (receita no `STATE`, seção Ambiente). As duas tabelas novas são privadas e
ficam fora da publication, então em tese não deveria acontecer — mas `plan` mudou.

```bash
bun run:dev scripts/seed-courses.ts
bun run:dev scripts/stripe-sync-plans.ts --adopt plan-trial=prod_VFW6CAlayZiEO2 --adopt plan-mensal=prod_VFW5Pqq3eST6Xr
```

O seed **converge** o catálogo (`ON CONFLICT DO UPDATE`), então corrige os `priceCents = 0`
que já estão no banco. O sync adota os produtos que você criou à mão em vez de duplicá-los,
e **confere valor, moeda e recorrência antes de gravar** — se o Price não bater com o
plano, ele recusa em vez de ligar errado. Use `--dry-run` para ver o que faria.

### 4. Ligar o provider

`BILLING_PROVIDER` continua `manual` de propósito — trocar antes das chaves existirem
derruba o checkout. Quando as chaves estiverem no lugar, mude para `stripe` no bloco `env`
do `package.json` e rode `bun env:update`.

### 5. Webhook em desenvolvimento

```bash
stripe listen --forward-to localhost:8081/api/billing/webhook/stripe
```

O `whsec_` que a CLI imprime é o de desenvolvimento — o do painel só serve em produção.

Em produção, além da verificação de assinatura (que já existe), vale
[restringir por IP do Stripe](https://docs.stripe.com/ips.md) no endpoint.

## Arquivos desta integração

| | |
|---|---|
| [src/features/billing/providers/stripe.ts](src/features/billing/providers/stripe.ts) | **novo** — Checkout Session, cancelamento e verificação de webhook |
| [src/features/billing/providers/stripeEvents.ts](src/features/billing/providers/stripeEvents.ts) | **novo** — tradução dos eventos do Stripe para o nosso `BillingEvent`. Função pura, sem env nem SDK em runtime |
| [src/features/billing/registry.ts](src/features/billing/registry.ts) | uma linha registrando o provider |
| [src/database/schema-private.ts](src/database/schema-private.ts) | tabelas `billingCustomer` e `planProviderPrice` |
| [package.json](package.json) · [src/server/env-server.ts](src/server/env-server.ts) | dependência e as duas variáveis |

Não foram tocados (já existiam e servem como estão): a rota de checkout, a rota de
webhook, e as escritas de assinatura em `subscriptionActions.ts`.

## Como o fluxo funciona

1. A tela chama `POST /api/billing/checkout` com o `planId`. A rota **lê o usuário da
   sessão** — nunca do corpo — e confere se o plano está à venda.
2. `stripeProvider.createCheckout` resolve o Customer, busca o `price_id` do plano e cria
   a Checkout Session. Devolve `{ kind: 'redirect', url }`.
3. O usuário paga na página hospedada do Stripe e volta pela `success_url`.
4. O Stripe chama `POST /api/billing/webhook/stripe`. A assinatura é verificada com
   `constructEvent`; o evento é traduzido e vira escrita em `subscription` / `payment`.
5. O gate da Fase 4 lê `subscription.status` e o conteúdo destrava **sem recarregar** — é
   o Zero reagindo à escrita.

🔴 **O acesso é concedido pelo webhook, nunca pela página de sucesso.** A `success_url` é
só navegação: o usuário pode fechar o navegador antes dela, e ela não prova pagamento.

## Cartões de teste

Só funcionam em **test mode**. Qualquer validade futura e qualquer CVC de 3 dígitos.

| Cartão | Resultado |
|---|---|
| `4242 4242 4242 4242` | ✓ pagamento aprovado |
| `4000 0025 0000 3155` | ⚠️ exige autenticação 3D Secure |
| `4000 0000 0000 0002` | ✗ recusa genérica |
| `4000 0000 0000 9995` | ✗ recusa por saldo insuficiente |
| `4000 0000 0000 9987` | ✗ recusa por cartão perdido |
| `4000 0007 6000 0002` | cartão brasileiro (útil por a moeda ser BRL) |

Lista completa: https://docs.stripe.com/testing.md

## Eventos do webhook

Selecione **exatamente estes sete** no event destination de produção. Em desenvolvimento o
`stripe listen` encaminha tudo e o que não for tratado volta `ignored` com 200.

| evento | para quê |
|---|---|
| `checkout.session.completed` | primeira notícia da compra (recorrente **e** avulsa) |
| `invoice.paid` | grava `payment` do recorrente |
| `invoice.payment_failed` | vira `past_due` |
| `customer.subscription.created` | |
| `customer.subscription.updated` | renovação e mudança de status |
| `customer.subscription.deleted` | cancelamento chegando |
| `payment_intent.succeeded` | grava `payment` **da compra avulsa**, que não tem fatura |

⚠️ O painel do Stripe marca os três `customer.subscription.*` como *opcionais*. **Aqui não
são:** sem eles você só sabe da primeira compra, e assinatura cancelada seguiria liberando
conteúdo até o cron de expiração passar.

⚠️ `payment_intent.succeeded` dispara **também** para fatura de assinatura, com um id
diferente do `invoice.paid` — o que passaria pela deduplicação e contaria o mesmo dinheiro
duas vezes. Por isso [stripeEvents.ts](src/features/billing/providers/stripeEvents.ts)
ignora o que vier com `invoice` preenchido.

## Próximos passos

Em ordem de risco:

1. ✅ **Cancelar no Stripe ao revogar — feito.**
   [revokeSubscription.ts](src/features/billing/server/revokeSubscription.ts) cancela no
   gateway **antes** de escrever no banco, e a rota do admin passou a usá-la. Se o Stripe
   falhar, nada é gravado e o erro sobe (502) — marcar `canceled` aqui e falhar lá deixaria
   o cliente sem acesso e com a fatura chegando. `cancelSubscription` continua existindo
   como write puro, que é o que o webhook precisa.
2. **Popular `planProviderPrice`** (ver "Values to Replace").
3. **Agendar `/api/cron/expire-subscriptions`**, uma vez por dia. A rota existe e é
   protegida por `CRON_SECRET`; ninguém a chama. Sem isso, assinatura vencida continua
   liberando conteúdo.
4. **Customer Portal** (`stripe.billingPortal.sessions.create`) — entrega troca de cartão,
   faturas e cancelamento sem construir três telas.
5. **Testes.** O mapeamento de eventos é função pura e não tem teste; `bun test:unit` é o
   lugar.
6. **Fase 13** — a tela de assinar. Hoje não existe onde clicar.

Detalhamento em [docs/build-log/plan/11-stripe.md](docs/build-log/plan/11-stripe.md).

## Antes de ir para produção

⚠️ **Stripe Tax.** `automatic_tax` está `false`, o que é coerente com o começo — mas venda
de conteúdo digital tem incidência tributária, e no Brasil ainda há **nota fiscal**, que
nem o Stripe nem este repo emitem. Habilitar `automatic_tax` **não basta**: sem registro
fiscal ativo, o Stripe calcula zero e não devolve erro nenhum — é o erro mais comum de
Stripe Tax. Ver [Collect taxes for recurring
payments](https://docs.stripe.com/billing/taxes/collect-taxes.md).

Checklist oficial: https://docs.stripe.com/get-started/checklist/go-live.md

## Recursos

- https://docs.stripe.com/mcp
- https://support.stripe.com
