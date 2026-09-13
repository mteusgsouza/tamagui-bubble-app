# Fase 13 — Funil de assinatura (a UI)

**Status:** ⬜ pendente · **Pré-requisito humano:** — · **Depende de:** Fase 11 (checkout
devolve URL) e Fase 12 (o post bloqueado existe no cliente)

## Objetivo

Dar ao usuário onde clicar. Hoje `activePlans` só é lida por dois seletores do admin, e
`mySubscriptions` / `activeSubscription` são **código morto** — ninguém as importa. O
assinante não vê o que assinou, quando vence, nem como cancelar.

## Escopo

### 1. Card bloqueado no feed — a peça que converte

O `PostCard` passa a ter dois estados. Bloqueado quando a linha de `post` chegou mas a de
`postContent` não (é exatamente o sinal que a Fase 12 produz — não invente uma flag nova
nem pergunte ao servidor):

- título, tipo, data e contadores (o que já chega)
- `teaser`, quando houver
- mídia como poster desfocado ou placeholder de tipo — 🔴 **nunca pedindo bytes**: sem
  `postMedia`, a tela não tem `storageKey` nem deve tentar montar URL de R2
  (invariante 7). Se o card bloqueado precisar de imagem, ela vem de um campo público,
  não de uma URL assinada
- CTA para `/assinar`

⚠️ Curtir e comentar ficam **desabilitados com motivo visível**, não escondidos: sumir com
o botão faz o usuário achar que o app está quebrado. E a Fase 12 já fechou a escrita no
servidor — a UI aqui é cortesia, não segurança.

### 2. `/assinar` — a tabela de preços

Rota nova, dentro de `(app)` e acessível a quem está logado. Renderiza `activePlans`
(`priceCents`, `currency`, `interval`, `order`) e faz `POST /api/billing/checkout` com o
`planId`, seguindo o `{ kind: 'redirect', url }`.

Qualidade, não enfeite:

- 🔴 **Cor da marca é token** (invariante 6). `$accent*` / `$accentBackground`. Hex de
  acento dentro do componente é bug — foi a decisão 11 do `STATE`, tomada porque o mock
  nasceu com o âmbar repetido em ~80 pontos e trocar a cor depois não funcionou
- formatação de preço em helper puro e testado (`priceCents` → `R$ 29,90`), não
  `toFixed(2)` espalhado na tela. Moeda e intervalo vêm do dado, não hardcoded
- **estados de erro do checkout são parte do escopo**, não sobra: 401 (sessão caiu),
  422 `plan-inactive` (plano saiu de venda com a tela aberta), 501 `no-gateway`
  (`BILLING_PROVIDER` voltou para `manual`) e falha de rede. Cada um com texto que diz o
  que fazer. Tela de pagamento que falha em silêncio é a pior tela do app
- quem já tem assinatura ativa não vê "assinar" — vê o estado dela (item 3)

### 3. Estado da assinatura em Ajustes

Seção nova usando `activeSubscription` (que já existe e finalmente sai do limbo): plano,
status, `currentPeriodEnd`, e aviso quando `cancelAtPeriodEnd` está marcado.

Cancelar e trocar cartão **não** viram tela: botão que abre o Customer Portal da Fase 11.
Recriar isso no app seria reimplementar pior o que o Stripe hospeda — e o retorno do portal
chega pelo webhook, sem escrita especial.

⚠️ `status` vem do banco e pode estar `past_due` — e **`past_due` já corta o acesso**:
`ACTIVE_SUBSCRIPTION_STATUSES` é só `active` e `trialing`. Ou seja, primeira fatura recusada
e o conteúdo fecha, com o Stripe ainda tentando recobrar por dias. Precisa de texto próprio
("pagamento pendente — atualize o cartão"), e vale decidir se o gate ganha carência.

### 4. Feed vazio deixa de mentir

`app/(app)/home/(tabs)/feed/index.tsx:54` diz *"Nada por aqui ainda — quando o criador
publicar, aparece nesta tela"*. Depois da Fase 12 isso só é verdade quando o feed está
realmente vazio. Com posts bloqueados, o vazio some sozinho (os cards aparecem); o texto
continua correto para o caso de feed novo. **Confira, não presuma** — é uma linha e é a
primeira coisa que um usuário novo lê.

Mesma checagem em `courses/index.tsx:92`.

## Qualidade — o que esta fase não pode deixar passar

O trabalho aqui é UI, então a régua é a que a base já usa:

| | |
|---|---|
| **Rota nova exige reiniciar o `bun dev`** | file watching não funciona em `/mnt/f`. E `pkill -f "one dev"` **não mata** o servidor: é `Onejs:dev`. Sem isso você depura um fantasma |
| **Guard de rota nunca devolve `null`** (invariante 10) | desmontar a árvore reinicializa o roteador na primeira rota do grupo em ordem alfabética — hoje `/admin` |
| **Na web, layout é `<Slot/>`** | `Stack`/`Tabs` do react-navigation resetam a rota no carregamento direto de URL |
| **Componente reaproveitado, não copiado** | o card bloqueado é estado do `PostCard`, não um `LockedPostCard` paralelo. Duas árvores para o mesmo post divergem na primeira mudança de layout |
| **Nada de `any` novo** | o admin já carrega `(p: any)` herdado; não aumente a conta. O tipo do post vem de `~/features/feed/types` |
| **Texto em português** | inclusive mensagem de erro. O que vier do Takeout em inglês no arquivo que você tocar, traduza |

## Verificação

🔴 **Caminho de navegador só se prova no navegador.** Duas vezes nesta base um teste por
Node passou com o app quebrado (o upload para o R2, que era CORS, e o cadastro). Esta fase
é toda navegador.

⚠️ **Ferramenta automatizada não consegue clicar nestas telas.** O navegador de automação
roda com `document.hidden === true`, `requestAnimationFrame` não dispara, e todo componente
com `enterStyle` do Tamagui fica parado em `opacity: 0`. A tela parece **vazia**. Não é bug
do app — rode `document.hidden` no console antes de caçar fantasma. Roteiro de clique
humano, então:

1. Usuário sem assinatura: o feed mostra os cards bloqueados com teaser, curtir/comentar
   desabilitados, CTA levando a `/assinar`
2. `/assinar` lista os planos com preço e intervalo certos; clicar leva ao Stripe; pagar
   com `4242 4242 4242 4242` volta ao app
3. **Sem recarregar a página**, o conteúdo destrava — é o Zero reagindo à escrita do
   webhook. Se precisar de F5, o sync não está chegando e isso é bug desta fase
4. Ajustes mostra plano, status e vencimento; o botão abre o portal; cancelar lá marca
   `cancelAtPeriodEnd` e o app reflete
5. Plano desativado no admin com a tela de `/assinar` aberta → o checkout responde 422 e a
   tela diz o que aconteceu
6. Direto na URL `/assinar` (deslogado → login; logado → a tela), sem piscar em `/admin`
7. `bun check types` limpo; `bun test:unit` com o helper de preço coberto
8. **Celular físico**, pelo IP — e aí `EXTRA_TRUSTED_ORIGINS` precisa estar preenchido,
   senão todo POST de auth volta 403 `INVALID_ORIGIN`

## Não é desta fase

- **Cupom, teste grátis, upgrade/downgrade de plano.** `status: 'trialing'` existe no
  schema e nenhum caminho o cria; entra quando o produto pedir
- **Tela de histórico de faturas** — o portal do Stripe já a tem
