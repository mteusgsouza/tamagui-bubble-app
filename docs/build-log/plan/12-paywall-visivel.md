# Fase 12 — Paywall visível (o dado)

**Status:** ⬜ pendente · **Pré-requisito humano:** — · **Depende de:** nada (pode ir em
paralelo com a Fase 11)

## Objetivo

Fazer o post pago **existir** para quem não assina — título, data, tipo, contadores e uma
isca — sem entregar o conteúdo. Hoje ele não existe: o gate filtra a linha inteira no
servidor e o não-assinante vê *"Nada por aqui ainda"*, que é mentira quando o criador
publicou.

Fase de dados e permission. Nenhuma tela — é a Fase 13. Prova-se lendo a CVR, como a
Fase 4.

## O problema, e por que não tem remendo

O gate ([`src/data/where/canAccessContent.ts`](../../../src/data/where/canAccessContent.ts))
é `serverWhere`, ou seja **filtro de linha**. As permissions do Zero não têm granularidade
de coluna: não existe "sincroniza esta linha, menos o `body`".

Disso saem três becos sem saída, para ninguém perder tempo neles:

| tentativa | por que não |
|---|---|
| afrouxar o `postGate` e esconder o `body` na tela | a linha inteira chega ao cliente. `body` no cache local é `body` vazado — basta abrir o devtools |
| view do Postgres publicada no Zero | replicação lógica publica **tabela**, não view. O zero-cache não a vê |
| rota de API devolvendo os teasers | funciona, mas sai do Zero: perde reatividade, paginação e o cache que a lista→detalhe usa. Vira uma segunda fonte de verdade para o mesmo feed |

## A escolha: mover o conteúdo, não esconder a linha

**O paywall passa a ser sobre o conteúdo, não sobre a existência do conteúdo.**

- `post` vira **metadado público**: título, `kind`, `publishedAt`, contadores,
  `requiredPlanId` e um `teaser` novo. Qualquer usuário logado sincroniza.
- O que é o produto sai para tabelas **gated**: `body` vai para `postContent`; mídia já
  mora em `postMedia`/`media`.

É o modelo que a decisão 8 do `STATE` já pedia sem dizer ("defaults fecham, não abrem" —
mas fechar a *existência* fecha também a conversão), e resolve de raiz: não há como vazar
`body` pelo cliente porque `body` não está na linha que o cliente recebe.

### Migration

| mudança | onde |
|---|---|
| `post.teaser` (text, nullable) | `schema-public.ts` |
| nova `postContent (postId PK/FK, body)` | `schema-public.ts`, publicada |
| `post.body` → migra para `postContent.body` e sai de `post` | migration com `INSERT ... SELECT` antes do `DROP COLUMN` |

🔴 **Mudou o conjunto de tabelas publicadas → o replica do zero-cache tem que ser
reconstruído.** É a armadilha que a Fase 4 pagou: sem isso o zero-cache morre com `Unknown
table postContent` no primeiro INSERT. A receita que preserva o Postgres está no `STATE`,
seção Ambiente. E `bun zero:generate` é obrigatório, senão a query nova fica vazia sem erro.

### Permissions — e o erro que arruinaria a fase

Relaxar `canAccessPost` é o ponto inteiro. **Relaxar qualquer outra coisa junto é vazamento.**

| permission | depois | atenção |
|---|---|---|
| `canAccessPost` | `published && !deleted` (ou dono) | 🔓 relaxa **de propósito** |
| `canAccessPostContent` (nova) | o `postGate` de hoje, com o join de tier | 🔒 é aqui que o paywall passa a morar |
| `canAccessPostMedia` | **precisa parar de delegar ao `postGate`** | 🔴 hoje é `exists('post', postGate)`. Com `postGate` relaxado, isso entrega `storageKey` a todo mundo |
| `canAccessComment` | idem — checar entitlement, não `post` | 🔴 comentário de post pago é conteúdo pago |
| `canAccessReaction` | idem | 🔴 |

Extraia o join de tier do `postGate` para um helper (`hasEntitlementToPost`) e use-o nas
quatro de baixo. O `postGate` fica só com a parte de visibilidade.

🔴 **Permission de leitura ≠ de escrita** (invariante 9), e aqui isso deixa de ser
teórico: com o post visível, a tela **pode** oferecer curtir e comentar a quem não assina.
As `canWrite` de `comment` e `reaction` precisam exigir entitlement — hoje elas só checam
`userId`, porque a linha do post nunca chegava a quem não podia. **Essa proteção era
acidental e vai deixar de existir.**

### `teaser`: quem escreve

Campo no composer do admin, opcional. Sem teaser, o card bloqueado mostra título e tipo —
já é infinitamente melhor que nada. **Não gere teaser cortando `body` automaticamente:**
seria o `body` voltando à linha pública por outro caminho, com o corte decidido no
cliente.

## Escopo

1. Migration + `schema-public.ts` (`teaser`, `postContent`, saída de `body`)
2. `src/data/models/postContent.ts` — model, permission de leitura e mutations
3. `canAccessContent.ts` — o rearranjo da tabela acima, com `hasEntitlementToPost`
4. `comment.ts` / `reaction.ts` — `canWrite` passa a exigir entitlement
5. `src/data/queries/feed.ts` — `.related('content')` em `feedPosts` e `postDetail`
6. Composer do admin (`app/(app)/admin/posts/[postId].tsx`) — escreve `body` em
   `postContent` e ganha o campo `teaser`
7. `scripts/seed-posts.ts` — acompanhar o schema, com teaser nos posts de assinante
8. `bun zero:generate`

## Verificação

**Leia a CVR, não a tela** — é o método que a Fase 4 provou e o único que mostra o que o
zero-cache realmente entregou a cada cliente. `"zero_0/cvr".rows` no banco `zero_cvr`, e
olhe **`refCounts`**, não a presença da linha (linha revogada fica como lápide).

Com a cobaia `test-user-b` e os posts do seed (`p-cac` exige `plan-anual`):

| estado | `post` | `postContent` | `postMedia` / `media` |
|---|---|---|---|
| sem assinatura | **todos os publicados** | só os públicos | só dos públicos |
| Mensal ativo | todos | `+ p-funil`, **`p-cac` barrado** | idem |
| Anual ativo | todos | `+ p-cac` | idem |

A linha do Mensal continua sendo a prova: o tier respeitado por join de duas colunas.
A coluna `post` toda preenchida é a prova **desta** fase.

Além disso:

1. `SELECT body FROM postContent` tem o conteúdo dos 5 posts; `post` não tem mais `body`
2. Sem assinatura, tentar `comment.insert` num post pago → **rejeitado**. Este é o teste
   que não existia antes, porque o post nem chegava
3. `GET /api/media/<id>/play` de mídia de post pago, sem assinatura → **403** (a Fase 5
   já provava; confirmar que o relaxamento não abriu isto)
4. `bun check types` limpo, `bun test:unit` passando

## Alternativa, se a migration for inaceitável

Tabela `postTeaser` publicada em paralelo, escrita pela mesma mutation do post, só com
colunas seguras. Não mexe no gate existente — e o custo é um segundo caminho de escrita
que pode divergir do primeiro, mais o cuidado da invariante 1 (mutation roda duas vezes;
`newId()` e `Date.now()` saem da tela). Registrada aqui porque é a saída se o replica der
problema, não porque seja melhor.
