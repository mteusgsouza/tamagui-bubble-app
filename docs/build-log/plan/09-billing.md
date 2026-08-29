# Fase 9 — Billing (adapter agnóstico)

**Status:** ⬜ pendente · **Pré-requisito humano:** — (o gateway real fica pra depois)

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

## O job que ninguém lembra

O gate da Fase 4 filtra por `subscription.status`, não por data. Então alguém precisa
virar `active` → `expired` quando `currentPeriodEnd` passa. Sem isso, assinatura vencida
continua liberando conteúdo. Pode ser uma rota `app/api/cron/*` chamada por um scheduler
externo.

## Verificação

Conceder assinatura pelo admin → o conteúdo pago aparece. Revogar → some, incluindo
**403 na rota de playback de mídia**. Simular webhook com `curl` e conferir que
assinatura inválida é rejeitada.
