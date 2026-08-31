# Fase 9 — Billing (adapter agnóstico)

**Status:** ✅ concluída — ver [handoff](../handoffs/09-billing.md) · **Pré-requisito humano:** — (o gateway real fica pra depois)

## Escopo

`src/features/billing/`:
- `types.ts` — interface `BillingProvider`: `createCheckout()`, `cancel()`,
  `parseWebhook()`.
- `providers/manual.ts` — admin concede/revoga assinatura na mão. **É o suficiente pro
  MVP** e destrava testar o paywall inteiro sem gateway.
- `app/api/billing/webhook/[provider]+api.ts` — valida HMAC, normaliza o evento, atualiza
  `subscription` e insere `payment`.
- `app/api/billing/checkout+api.ts` — delega ao adapter ativo.

Quando o gateway for escolhido (Stripe, Asaas, Pagar.me ou Iugu), escreve-se só um
`providers/<nome>.ts`. Sem migration, sem mexer em permission.

## [Fase 8] O que já existe — o provider `manual` está quase pronto

`POST /api/admin/people` (em `app/api/admin/people+api.ts`) já implementa o que o
`providers/manual.ts` faria:

- `action: 'grant'` — concede assinatura (reusa a do par usuário+criador se existir)
- `action: 'revoke'` — marca `canceled` em vez de apagar, o histórico importa
- `action: 'setRole'` — promove/rebaixa

E a autorização dessas rotas **relê `user.role` do Postgres**, não da claim do JWT — é o
contorno do token de 3 anos. Copie esse padrão no webhook: quem chama é um gateway, não
uma sessão, mas a lição vale — não confie em nada que veio congelado.

`GET /api/admin/people` já soma `payment` com `status = 'paid'` por pessoa
(`paidCents`, `paymentCount`). O webhook desta fase é quem vai **inserir** essas linhas;
hoje a tabela está vazia.

**Falta e é desta fase:** criar `plan` pela UI. A tela de Pessoas lista os planos ativos
para conceder, mas ninguém os cria — hoje é `INSERT` à mão (ou `scripts/seed-courses.ts`).

## O job que ninguém lembra

O gate da Fase 4 filtra por `subscription.status`, não por data. Então alguém precisa
virar `active` → `expired` quando `currentPeriodEnd` passa. Sem isso, assinatura vencida
continua liberando conteúdo. Pode ser uma rota `app/api/cron/*` chamada por um scheduler
externo.

## Verificação

Conceder assinatura pelo admin → o conteúdo pago aparece. Revogar → some, incluindo
**403 na rota de playback de mídia**. Simular webhook com `curl` e conferir que
assinatura inválida é rejeitada.
