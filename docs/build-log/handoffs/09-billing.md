# Fase 9 — Billing

## Objetivo

Cobrança agnóstica de gateway: um adapter que qualquer provedor implementa, o webhook
que recebe os eventos dele, o job que expira assinatura vencida, e a UI que cria os
planos — que até aqui só existiam por `INSERT` à mão.

## Feito

| Arquivo | O que é |
|---|---|
| [`billing/types.ts`](../../../src/features/billing/types.ts) | contrato `BillingProvider`, `BillingEvent`, `SubscriptionStatus` |
| [`billing/registry.ts`](../../../src/features/billing/registry.ts) | quais providers existem e qual está ativo |
| [`billing/providers/manual.ts`](../../../src/features/billing/providers/manual.ts) | concessão manual — o provider do MVP |
| [`billing/providers/generic.ts`](../../../src/features/billing/providers/generic.ts) | provider HMAC: referência e alvo de teste |
| [`billing/webhookSignature.ts`](../../../src/features/billing/webhookSignature.ts) | `verifyHmac` / `signPayload`, sem env e sem banco |
| [`billing/server/subscriptionActions.ts`](../../../src/features/billing/server/subscriptionActions.ts) | **as escritas de assinatura e pagamento, num lugar só** |
| [`api/billing/checkout+api.ts`](../../../app/api/billing/checkout+api.ts) | inicia assinatura pelo provider ativo |
| [`api/billing/webhook/[provider]+api.ts`](../../../app/api/billing/webhook/%5Bprovider%5D+api.ts) | valida assinatura, normaliza, grava |
| [`api/cron/expire-subscriptions+api.ts`](../../../app/api/cron/expire-subscriptions+api.ts) | o job que ninguém lembra |
| [`admin/plans.tsx`](../../../app/(app)/admin/plans.tsx) | CRUD de planos |
| [`admin/planForm.ts`](../../../src/features/admin/planForm.ts) | preço, slug e validação — puros |
| [`scripts/billing-smoke.ts`](../../../scripts/billing-smoke.ts) | smoke do fluxo inteiro contra o dev |
| [`plan-form.test.ts`](../../../src/test/unit/plan-form.test.ts) · [`webhook-signature.test.ts`](../../../src/test/unit/webhook-signature.test.ts) | 27 testes novos |

Editado: [`api/admin/people+api.ts`](../../../app/api/admin/people+api.ts) passou a usar
`grantSubscription`/`cancelSubscription` em vez de escrever direto (−56 linhas);
[`queries/admin.ts`](../../../src/data/queries/admin.ts) ganhou `adminPlans`;
[`AdminShell.tsx`](../../../src/features/admin/AdminShell.tsx) ganhou a aba Planos;
`env-server.ts`, `package.json` e `ci.yml` ganharam `BILLING_PROVIDER`,
`BILLING_WEBHOOK_SECRET` e `CRON_SECRET` (via `bun env:update`).

## Decisões

**1. As escritas moram em `subscriptionActions.ts`, não em cada rota.** Três chamadores
mexem em `subscription`: o admin, o webhook e o cron. Se cada um escrevesse do seu jeito,
o gate da Fase 4 — que lê `subscription.status` — passaria a depender de qual caminho
gravou por último. Foi por isso que a rota de pessoas foi refatorada nesta fase, e não
por estética.

**2. O checkout recusa o provider `manual`.** `manualProvider.createCheckout()` concede
a assinatura na hora — é o que "concessão manual" significa. Expor isso em
`POST /api/billing/checkout` com `BILLING_PROVIDER=manual` daria **assinatura de graça a
qualquer um que fizesse o POST**. A rota devolve `501 no-gateway`; conceder de graça
continua sendo privilégio de `/api/admin/people`, que exige admin.

**3. Quem assina é a sessão, nunca o corpo.** O `userId` sai de
`getAuthDataFromRequest`. Aceitar `userId` do corpo deixaria qualquer pessoa logada
assinar em nome de outra.

**4. A validação de assinatura vive dentro do `parseWebhook` de cada provider e
lança.** Não há cookie nem JWT no webhook: a única prova de origem é o HMAC do corpo.
Um webhook que aceita corpo não assinado é a base de assinaturas aberta para quem
descobrir a URL. E o corpo assinado é o **cru** — reserializar o JSON mudaria os bytes.

**5. `timingSafeEqual`, não `===`.** Comparar assinatura com igualdade comum vaza, pelo
tempo de resposta, quantos bytes iniciais bateram.

**6. Existe o provider `generic` porque webhook sem gateway é código que nunca roda.**
O `manual` não recebe webhook. Sem o `generic`, a rota inteira ficaria não-testada até
alguém contratar um gateway. Ele também é o exemplo de como escrever o próximo: Stripe,
Asaas e Pagar.me mudam o nome do cabeçalho e o formato do corpo — a forma é a mesma.

**7. O que o gateway não pode consertar reenviando volta 200; o que ele pode, não.**
Evento de tipo desconhecido, pagamento de dono inexistente, assinatura desconhecida sem
`userId`: **200 com `ignored`**, porque gateway que recebe erro reenvia para sempre.
Assinatura inválida: **401**. Pagamento recebido que não virou acesso (`grant` falhou):
**422** — isso aparece no painel do gateway como webhook falho, que é exatamente o
alarme que se quer.

**8. Plano nunca é apagado, só sai de venda.** Ele é o `requiredPlanId` de posts antigos
e o `planId` de assinaturas já vendidas. Por isso `adminPlans` lista inclusive os
inativos, e a tela só tem "Tirar de venda".

**9. A tela de Planos usa Zero direto, não rota de API.** `plan` é tabela pública e
`models/plan.ts` já fecha a escrita com `serverWhere(() => false)`, que o
`defaultAllowAdminRole: 'all'` destrava só para admin. Não havia nada a acrescentar no
servidor. Corolário: a aba fica **escondida para quem não é `role = 'admin'`** — mostrá-la
ao criador daria um formulário que salva e reverte sozinho.

**10. Slug é validado antes da mutation.** O Postgres tem unique index em `plan.slug`, e
com Zero a mutation recusada pelo servidor é aplicada e **revertida** na tela. Validar
antes é o que impede o formulário de piscar.

## Verificado

`bun check types` limpo · `bun test:unit` **92 testes** (era 65).

`bun run:dev scripts/billing-smoke.ts test-user-b plan-anual` — 12 verdes:

| Caso | Resultado |
|---|---|
| webhook sem assinatura / com outro segredo / corpo adulterado | 401 |
| webhook de provider inexistente | 404 |
| cron sem token / token errado | 401 |
| checkout sem sessão | 401 |
| cron com token certo | 200 |
| webhook assinado cria assinatura | 200, linha em `subscription` |
| webhook registra pagamento | 200 `recorded` |
| **mesmo pagamento reenviado** | 200 `duplicate` — a idempotência por `providerPaymentId` |

O job de expiração, provado no banco: com `currentPeriodEnd` recuado 2 dias, o cron
devolveu `{"expired":1}` e a linha virou `status = expired` — que é o que fecha o
paywall.

No navegador (`/admin/plans`, logado como admin): criei "Plano Trimestral" com preço
`R$ 99,90`, o slug saiu derivado do nome (`plano-trimestral`), e a linha apareceu no
Postgres com `priceCents = 9990`. Tentar salvar um segundo plano com slug `mensal`
mostrou "Já existe um plano com o slug "mensal"" **sem** disparar mutation. Dados de
teste apagados no fim.

`/api/admin/people` depois da refatoração: `grant` cria, `grant` de novo devolve
`reused: true` (uma assinatura por par usuário+criador), `revoke` cancela, e usuário
inexistente continua devolvendo 422 `no-public-profile` com a mesma mensagem de antes.

## Corrigido no caminho

**O smoke pegou um 500 real.** `payment.userId` tem FK para `user`; um `userId` que o
gateway mandasse errado estourava a FK, virava 500, e gateway que recebe 500 reenvia o
mesmo evento para sempre. `recordPayment` agora confere o dono antes e devolve
`skipped: 'unknown-user'`.

**O criador foi promovido a `role = 'admin'`** (`demo-user-id`). Era pendência aberta no
STATE desde a Fase 5 e virou bloqueio aqui: sem admin nenhum no banco, **ninguém** abria
Planos nem Pessoas. A sessão passou a reportar `role: admin` sem re-login (o
`get-session` lê do banco); a claim do **JWT do Zero** é que continua congelada por 3
anos — por isso as rotas `/api/admin/*` releem a role do Postgres.

## Não feito

- **Nenhum gateway real.** `BILLING_PROVIDER=manual`. Escolher Stripe/Asaas/Pagar.me é
  decisão comercial; escrever o provider é uma tarde depois de escolhido, seguindo o
  `generic.ts`.
- **Não existe tela de assinar.** O assinante não tem para onde clicar: a tabela de
  preços (`activePlans`) não é renderizada em lugar nenhum do app. Enquanto o provider é
  `manual` isso é coerente — o acesso é concedido pelo admin —, mas é a primeira coisa
  a fazer quando houver gateway.
- **`cancel()` do provider não é chamado por ninguém.** Revogar pelo admin cancela **no
  nosso banco**; com gateway real é preciso cancelar lá também, senão a cobrança
  continua.
- **Ninguém agenda o cron.** A rota existe e está protegida por `CRON_SECRET`, mas nada
  a chama sozinho. Em produção: Vercel Cron, GitHub Actions com `schedule`, ou cron da
  VPS. Uma vez por dia basta.
- **`payment` não aparece em lugar nenhum além do total por pessoa** na tela de Pessoas.

## Contrato pro próximo (Fase 10 — Auth)

O que esta fase deixou pronto e você deve usar:

- **`CRON_SECRET` e `BILLING_WEBHOOK_SECRET` estão em `.env.development`** com valores
  de desenvolvimento. Em produção vêm do painel do gateway. `BILLING_PROVIDER` está em
  `.env`.
- **O criador agora é `role = 'admin'`.** Se a Fase 10 mexer em cadastro, lembre que
  usuário novo nasce `role = 'user'` e **precisa de `userPublic`** para poder receber
  assinatura — `grantSubscription` devolve `no-public-profile` sem isso. Vale conferir
  se o fluxo de cadastro cria a linha em `userPublic`; se não criar, assinar nunca vai
  funcionar para conta nova.
- **Query nova exige `bun zero:generate`** (`adminPlans` já está registrada, são 18).
- ℹ️ **`git status` visto da WSL mente.** O git do Windows tem `core.autocrlf=true`, então
  a árvore de trabalho fica em CRLF e ele normaliza sozinho no commit. Da WSL
  (`autocrlf` desligado) isso aparece como ~15 arquivos "modificados" sem uma linha de
  diferença real. **Comite pelo git do Windows** — é onde a identidade está configurada;
  na WSL o `user.name` nem existe.

## Comandos pro usuário rodar

```bash
bun check types
bun test:unit
bun run:dev scripts/billing-smoke.ts
```

Esperado: typecheck limpo, 92 testes, e o smoke todo verde (com o `bun dev` no ar).
Passando `userId` e `planId` reais, o smoke também concede, cobra e testa idempotência —
e deixa a assinatura criada no banco, então use uma conta de teste.
