# Handoff 20 — Curso avulso

## Objetivo

Vender um curso fora da assinatura. A Fase 19 criou o estado `needs-purchase`; esta fase faz o
botão cobrar, pelo **mesmo** caminho do plano avulso da Fase 11 (sem gateway novo).

## Feito

**Banco** — migration `20261102000730_amused_korvac`: `course.priceCents` (nulo = não vende),
`payment.courseId` (privada, FK `set null`) e `courseProviderPrice` (cópia de
`planProviderPrice`, com `active` porque Price no Stripe é imutável).

| Arquivo | O quê |
|---|---|
| `src/features/billing/types.ts` | `CheckoutRequest.subject`: união marcada `plan` \| `course`; `payment.succeeded` ganhou `courseId` |
| `providers/stripe.ts` | curso cai no ramo `isOneTime` existente: `mode: 'payment'`, `metadata` na sessão **e** em `payment_intent_data`, **sem** `subscription_data`; `success_url` volta ao curso |
| `providers/stripeEvents.ts` | `payment_intent.succeeded` leva `courseId`; sessão avulsa de curso é `ignored` (quem grava é o intent); sessão avulsa sem `planId` virou `ignored` em vez de assinatura vazia. **A regra da fatura (`invoice` → ignorado) não foi tocada** |
| `server/courseActions.ts` | **novo** — `recordCoursePurchase`: `payment` + matrícula numa transação, idempotente por `providerPaymentId` |
| `server/content/enrollments.ts` | `enrollByPurchase` (aceita transação); se já havia matrícula por assinatura/free, a origem **sobe** para `purchase` |
| `app/api/billing/checkout+api.ts` | aceita `planId` **ou** `courseId`; 422 `course-not-for-sale` e `already-has-access` |
| webhook | `courseId` no evento → `recordCoursePurchase`; falha vira 422 (dinheiro recebido sem acesso aparece como webhook falho) |
| `scripts/stripe-sync-courses.ts` | irmão do de planos; preço mudou → aposenta o antigo e cria outro **no mesmo Product** |
| `scripts/stripe-deliver-webhook.ts` | **novo** — entrega ao servidor local o `payment_intent.succeeded` de uma compra real (não há `stripe listen`); `--times N` prova idempotência |
| admin do curso | campo "Preço da compra avulsa", erro em valor inválido, aviso "inalcançável" quando `none` sem preço |
| detalhe do curso | "Comprar este curso — R$ 97,00", erro de checkout, e ao voltar com `?checkout=success` consulta a cada 2 s (até 30 s) enquanto o webhook não chega |

## Decisões

- `billingApi.startCheckout` agora manda **só a base** (`location.origin`) como `returnUrl`; o
  provider acrescenta o caminho. Isso corrige de passagem o defeito 1 do "retorno do checkout"
  do STATE **na web** (a URL inteira era tratada como base).
- Quem não assina também pode comprar (`needs-purchase` já era o motivo para `none`).
- Comprar quando já pode se matricular → 422 `already-has-access`.

## Validado (01/11/2026, navegador + Postgres + Stripe test mode)

| Verificação | Resultado |
|---|---|
| admin: `none` sem preço | aviso "inalcançável"; "abc" → erro; "97,00" → ambos somem; salvar grava `9700` |
| `stripe-sync-courses --dry-run`, real, de novo | cria Product+Price; segunda rodada "já ligado — pulado" |
| Assinante sem matrícula | botão **"Comprar este curso — R$ 97,00"** |
| checkout | Stripe mostra R$ 97,00 e o nome do curso; cartão `4242`; volta em `/home/courses/<slug>?checkout=success` |
| webhook entregue 2× | 1ª: `recorded` + `enrollmentId`; 2ª: `duplicate` |
| banco | `payment` com `courseId`, `status = paid`, `subscriptionId` nulo · `enrollment.source = purchase` · `count(subscription)` inalterado |
| aula não gratuita | `/api/lesson/<id>` 200 |
| revogar assinatura (`/api/admin/people`) | assinatura `canceled`; matrícula `purchase` **segue ativa**; aula 200 |

Dados de teste revertidos (curso `included`, sem preço; assinatura e matrícula do Assinante como
antes; `payment` e `courseProviderPrice` apagados). O Product/Price do sandbox **ficou** no
Stripe. `bun check types` limpo; **228 testes** (223 + 5 de curso).

## Conhecido e NÃO resolvido

- ⚠️ **Mudar o preço no admin não muda a cobrança sozinho**: o Checkout usa o Price ativo do
  Stripe até alguém rodar `stripe-sync-courses.ts`. O hint do campo avisa; não há guarda.
  O caminho de troca de Price (aposentar + criar) foi lido, **não exercido**.
- ⚠️ O webhook foi **entregue por script**, não pelo Stripe: o `stripe-deliver-webhook` assina com o
  segredo real e usa o PaymentIntent real, mas o Stripe nunca chamou o servidor. Assinatura
  real/`stripe listen` continua sem prova.
- ⚠️ O estado "Liberando o seu acesso…" (retorno antes do webhook) foi visto na tela; a
  liberação automática por polling não foi observada — a tela parou de consultar antes da
  entrega do webhook, e foi preciso recarregar.
- ⚠️ Teste de que a matrícula de compra **não** é revogada por fim de assinatura foi feito à mão
  (passo acima); **não há teste automatizado** (exige banco; `recordCoursePurchase` e
  `enrollByPurchase` também não têm teste de integração).
- ⚠️ `billing-smoke.ts` ganhou os casos de curso (3) mas **não foi executado**.
- ⚠️ Nativo: checkout continua abrindo navegador externo e o retorno por `bubble://` segue sem
  prova (Fase 15). O `success_url` com esquema próprio continua sendo o defeito 2 do STATE.
- 🔴 **Reembolso continua sem tratamento** (`charge.refunded`): agora há dois tipos de compra
  que o estorno não alcança. Merece fase própria.
- ⚠️ `Visitante` e `Criador` não foram exercidos na tela de compra.
