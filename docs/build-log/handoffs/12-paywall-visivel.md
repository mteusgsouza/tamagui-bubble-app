# Handoff 12 — Paywall visível

## Objetivo

Fazer o post pago **existir** para quem não assina, sem entregar o conteúdo. Antes, o gate
filtrava a linha inteira e o não-assinante via *"Nada por aqui ainda"* — mentira quando o
criador publicou, e nenhum motivo para pagar.

## O redesenho

**O paywall passou a ser sobre o conteúdo, não sobre a existência do conteúdo.**

| | antes | depois |
|---|---|---|
| `post` | filtrado por visibilidade **e** tier | vitrine pública: chega a todo logado |
| `body` | coluna de `post` | tabela `postContent`, atrás do gate |
| isca | não existia | `post.teaser`, público |
| sinal de bloqueado | — | **ausência de `content`** no que o Zero sincronizou |

Três becos sem saída foram descartados e estão no [plano](../plan/12-paywall-visivel.md):
esconder `body` na tela (a linha chega ao cliente do mesmo jeito), view do Postgres
(replicação lógica publica tabela, não view) e rota de API (segunda fonte de verdade para
o mesmo feed, sem reatividade).

## Feito

| arquivo | o quê |
|---|---|
| `src/database/schema-public.ts` | `post.teaser`; `post.body` saiu; tabela `postContent` |
| `src/data/models/postContent.ts` | **novo** — model e permission de escrita |
| `src/data/models/post.ts` | `body` → `teaser` |
| `src/data/where/canAccessContent.ts` | `postGate` virou `hasFullAccessToPost`; nasceu `postVisibilityGate`; nasceu `canAccessPostContent` |
| `src/data/models/comment.ts` · `reaction.ts` | `canWrite` passou a exigir entitlement |
| `src/data/relationships.ts` | `post.content` e `postContent.post` |
| `src/data/queries/feed.ts` · `admin.ts` | `.related('content')` nas quatro queries |
| `src/features/feed/types.ts` | `isPostLocked`, `teaser`, `content` |
| `src/features/feed/PostCard.tsx` · `PostDetail.tsx` | mostram teaser quando bloqueado |
| `app/(app)/admin/posts/[postId].tsx` | campo de isca; grava o corpo em `postContent` |
| `scripts/seed-posts.ts` | iscas e `postContent` |
| `src/test/unit/post-locked.test.ts` | **novo** — 3 casos |

Migration `20260913211526_glossy_prodigy`.

## Decisões

1. **Relaxar `canAccessPost` sem trocar as outras três seria vazamento.**
   `canAccessPostMedia`, `canAccessComment` e `canAccessReaction` **delegavam ao
   `postGate`**. Com ele frouxo, entregariam `storageKey` e comentário de post pago a
   qualquer logado. Por isso o gate antigo mudou de nome (`hasFullAccessToPost`) em vez de
   ser editado no lugar: renomear obriga a olhar cada chamador.
2. 🔴 **A proteção de escrita era acidental.** Ninguém comentava em post pago porque a
   linha do post nunca chegava — não porque alguma regra proibisse. Agora chega, e
   `canWrite` de `comment` e `reaction` exige entitlement explicitamente. É a invariante 9
   deixando de ser teórica.
3. 🔴 **A linha de `postContent` nasce sempre, mesmo vazia.** Ausência dela é o sinal de
   bloqueado; post sem ela apareceria bloqueado **para o próprio criador**. Vale no
   composer (`ensurePost`) e no seed.
4. **`isPostLocked` checa o objeto `content`, não o `body`.** Post de foto ou áudio pode
   não ter texto; checar o `body` faria todo post sem texto aparecer com paywall para quem
   já pagou. Tem teste para isso.
5. **O teaser é escrito pelo criador, nunca cortado do `body`.** Gerar automaticamente
   seria o `body` voltando à linha pública por outro caminho, com o corte decidido no
   cliente.
6. **Isca só aparece no composer em post de assinante.** Post público não tem o que
   bloquear, e o campo ali só confundiria.
7. **`teaser` é coluna nova, não rename de `body`.** O drizzle-kit pergunta isso na
   migration; responder "rename" jogaria o texto pago dentro da coluna pública — o
   vazamento exato que a fase existe para evitar.

## Comandos (já rodados)

```bash
bunx on-zero generate        # 14 models, 18 queries, 47 mutations
bun backend:clean && bun backend
bun run:dev scripts/seed-courses.ts
bun run:dev scripts/seed-posts.ts
bun run:dev scripts/stripe-sync-plans.ts --adopt plan-trial=prod_VFW6CAlayZiEO2 --adopt plan-mensal=prod_VFW5Pqq3eST6Xr
bun test:unit
```

🔴 **O `backend:clean` foi obrigatório**, não conveniência: `postContent` entrou na
publication (14 tabelas, era 13) e o replica do zero-cache precisa nascer de novo, senão
morre com `Unknown table postContent` no primeiro INSERT. É a armadilha da Fase 4.

🔴 **E `backend:clean` leva o mapeamento do Stripe junto.** `planProviderPrice` e
`billingCustomer` moram no mesmo Postgres, então **o sync tem que ser refeito** — senão o
checkout responde 500 `checkout-failed` e a tela só diz "não deu para abrir o pagamento".
A primeira versão desta lista omitia o `stripe-sync-plans` e o buraco foi encontrado
clicando em Assinar. Some a isso que **as contas de teste também somem**: a migration só
recria o `demo@takeout.tamagui.dev`, então a cobaia precisa ser criada de novo pela UI.

Verificado: typecheck limpo · **114 testes** (era 111) · publication com 14 tabelas ·
`post` sem `body` · 5 posts com linha em `postContent`, 3 com isca.

## Não feito

- 🔴 **O gate nunca rodou em runtime.** É a lacuna que importa: typecheck e teste de
  unidade não alcançam permission do Zero. A prova é ler `"zero_0/cvr".rows` no banco
  `zero_cvr` olhando **`refCounts`** (linha revogada vira lápide e continua na tabela),
  com uma cobaia nos três estados:

  | estado | `post` | `postContent` | `postMedia` |
  |---|---|---|---|
  | sem assinatura | **os 5** | só os 2 públicos | só dos públicos |
  | Mensal ativo | os 5 | `+ p-funil`, `+ p-anuncio`, **`p-cac` barrado** | idem |
  | Anual ativo | os 5 | `+ p-cac` | idem |

  A coluna `post` cheia nos três é a prova desta fase.
- ⚠️ **Não há cobaia.** O `backend:clean` apagou o `test-user-b`; a migration só recria o
  `demo@takeout.tamagui.dev`, que é o criador e passa por todos os gates. Crie uma conta
  nova pela UI.
- ⚠️ **`plan-anual` está fora de venda** (Fase 11) e é o que `p-cac` exige. O estado "Anual
  ativo" só se consegue concedendo pelo admin — pelo checkout não dá, e está correto.
- **Escrita bloqueada não foi exercida**: falta provar que um não-assinante recebe recusa ao
  tentar comentar ou curtir um post pago. É o teste que **não existia antes**, porque o
  post nem chegava.
- **`exists` dentro de `exists` continua sem prova de runtime** — agora com um caso a mais
  (`canAccessPostContent`).
- **Cursos não receberam o mesmo tratamento.** `canAccessCourse` continua filtrando a linha
  inteira, então curso pago segue invisível para quem não assina. Mesma classe de problema,
  fora do escopo desta fase.

## Contrato para a próxima fase (13)

- **`post` sem `content` = bloqueado.** Use `isPostLocked` de `~/features/feed/types`; não
  invente flag nem pergunte ao servidor.
- `post.teaser` é o texto a mostrar no card bloqueado. Pode ser nulo — aí sobra título e
  tipo, que já é melhor que nada.
- Curtir e comentar num post bloqueado **já são recusados pelo servidor**. A UI deve
  desabilitar com motivo visível; é cortesia, não segurança.
- 🔴 **O card bloqueado não tem `postMedia`**, logo não tem `storageKey`. Não tente montar
  URL de R2 (invariante 7). Imagem de card bloqueado, se houver, vem de campo público.
- Hoje o post bloqueado renderiza só o teaser, **sem dizer que está bloqueado e sem CTA** —
  é o buraco que a Fase 13 fecha.
