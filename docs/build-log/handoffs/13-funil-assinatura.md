# Handoff 13 — Funil de assinatura

## Objetivo

Dar ao usuário onde clicar. A Fase 12 fez o post pago aparecer; esta faz o card dizer que
está bloqueado, oferece a tela de preços e mostra o que a pessoa assinou.

Com ela, **o ciclo de receita fecha**: dá para descobrir o conteúdo, pagar e ver o acesso.

## Feito

| arquivo | o quê |
|---|---|
| `app/(app)/home/assinar.tsx` | **novo** — tabela de preços, checkout, estados de erro |
| `app/(app)/home/_layout.tsx` | `assinar` como irmã de `(tabs)` no Stack nativo |
| `src/features/billing/formatPrice.ts` | **novo** — preço, intervalo e nota de renovação, tudo puro |
| `src/features/billing/client/billingApi.ts` | **novo** — checkout, portal, `returnUrl` por plataforma, mensagem por código de erro |
| `src/features/billing/SubscriptionCard.tsx` | **novo** — estado da assinatura em Ajustes |
| `app/api/billing/portal+api.ts` | **novo** — Customer Portal (era pendência da Fase 11) |
| `src/features/billing/types.ts` · `providers/stripe.ts` | `createPortalSession`, **opcional** no contrato |
| `src/features/feed/PostCard.tsx` · `PostDetail.tsx` | estado bloqueado, com cadeado e CTA |
| `src/interface/icons/phosphor/LockIcon.tsx` | **novo** |
| `app/(app)/home/(tabs)/courses/index.tsx` | o vazio deixa de mentir |
| `app/(app)/home/(tabs)/settings/index.tsx` | monta o `SubscriptionCard` |
| `src/helpers/apiFetch.ts` | **novo** — extraído de `mediaApi.ts` (ver decisão 5) |
| `src/test/unit/format-price.test.ts` | **novo** — 7 casos |

Verificado: typecheck limpo · **121 testes** (era 114).

## Decisões

1. **`/home/assinar` fica fora de `(tabs)` e fora da raiz de `(app)`.** Fora das abas
   porque é caminho de conversão, não seção — barra de abas embaixo é convite a sair no
   meio. Fora da raiz porque "assinar" vem **antes** de "admin" em ordem alfabética, e a
   primeira rota do grupo é o destino do escorregão da invariante 10. Não vale mudar isso
   por causa de uma tela.
2. **O Customer Portal é método opcional do adapter.** O `manual` não tem portal; ausente,
   a tela **some com o botão** em vez de oferecer um que quebra — decisão 18 aplicada.
   Reimplementar troca de cartão e faturas no app seria fazer pior o que o Stripe hospeda,
   e o cancelamento feito lá volta pelo webhook sem escrita especial.
3. **Estado de erro do checkout é escopo, não sobra.** Cada código (`plan-inactive`,
   `no-gateway`, `unauthenticated`, rede) tem frase própria dizendo **o que fazer**. Tela
   de pagamento que falha em silêncio é a pior tela do app.
4. **O avulso precisa dizer o prazo.** `planPriceLabel` rende `R$ 10,00 · 30 dias`, não só
   o preço: sem isso o usuário assume acesso permanente e, 30 dias depois, o cron derruba
   e parece golpe. Tem teste.
5. **`mediaApi` virou `~/helpers/apiFetch`.** Ele nunca foi só de mídia — o admin de
   pessoas já o importava — e a cobrança precisava do mesmo (status e código crus, que o
   `authFetch` embrulha). `mediaApi.ts` ficou como apelido, então os 15 usos e os
   `instanceof MediaApiError` continuam valendo: é a **mesma** classe.
6. **Os CTAs usam `Button variant="accent"`**, que já existia. A primeira versão tinha
   quatro pílulas montadas à mão com `XStack` — duplicação que divergiria na primeira
   mudança de marca.
7. **Curso: o vazio passou a admitir o que não sabe.** `canAccessCourse` ainda filtra a
   linha inteira, então curso de assinante é invisível para quem não assina. Dizer "nenhum
   curso ainda" seria a mesma mentira que o feed contava antes da Fase 12; enquanto o gate
   não mudar, o texto diz "pode haver cursos só para assinantes" e oferece saída.
8. **Bloqueado não monta mídia.** Sem `postMedia` não há `storageKey`, e a tela não inventa
   URL de R2 (invariante 7). O card mostra o **lugar** da mídia, não a mídia borrada —
   borrar exigiria receber o arquivo.

## Comandos

```bash
bun test:unit
```

🔴 **Reinicie o `bun dev`** — rota nova, e file watching não funciona em `/mnt/f`. É
`pkill -f "Onejs:dev"`, **não** `one dev`, senão o servidor velho continua servindo.

⚠️ Acrescentei `/home/assinar` ao `app/routes.d.ts` **na mão**, porque ele é gerado pelo
scanner de rotas e o watcher não roda. O próximo `bun dev` regenera; se o diff aparecer,
é ruído esperado.

## Não feito

- 🔴 **Nada foi clicado.** Esta fase é toda navegador e **nenhuma tela foi aberta**. Some
  isso com o que já estava pendente: a Fase 11 nunca teve uma compra real e a Fase 12 nunca
  teve a CVR lida. As três se provam no mesmo roteiro, abaixo.
- **Cupom, trial, upgrade/downgrade** — `status: 'trialing'` existe e nada o cria.
- **Curso continua sem paywall visível** (decisão 7).
- **A tela não distingue "plano errado" de "sem assinatura".** Quem tem o Mensal e abre um
  post que exige o Anual vê o mesmo card. O texto do paywall menciona plano específico
  quando `requiredPlanId` existe, mas não diz **qual**.

## Roteiro de verificação (fecha 11, 12 e 13 de uma vez)

Precisa de conta nova: o `backend:clean` apagou o `test-user-b`, e o `demo` é o criador,
que passa por todos os gates.

1. Criar conta pela UI. O feed deve mostrar **os 5 posts** — 2 abertos e 3 com cadeado,
   teaser e "Assinar".
2. Ler a CVR (`"zero_0/cvr".rows` no banco `zero_cvr`, olhando **`refCounts`**): `post` com
   os 5, `postContent` só com os 2 públicos. **É a prova da Fase 12.**
3. Tentar curtir/comentar num post pago pelo devtools → recusado pelo servidor.
4. `/home/assinar` lista Avulso (R$ 10,00 · 30 dias) e Mensal (R$ 10,00/mês).
5. Clicar → Stripe → pagar com `4242 4242 4242 4242`. **É a prova da Fase 11** (o
   `createCheckout` nunca rodou).
6. Voltar: o conteúdo destrava **sem F5** — é o Zero reagindo ao webhook. Se precisar
   recarregar, o sync não está chegando e isso é bug.
7. Ajustes mostra plano, status e vencimento; "Gerenciar assinatura" abre o portal.
8. Plano desativado no admin com `/home/assinar` aberta → 422 com texto claro.
9. Celular físico pelo IP — e aí `EXTRA_TRUSTED_ORIGINS` precisa estar preenchido.

⚠️ **Ferramenta automatizada não consegue clicar nestas telas** (`document.hidden`, o
`enterStyle` do Tamagui parado em `opacity: 0`). Tem que ser humano.
