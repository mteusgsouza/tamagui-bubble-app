# Fase 4 — Camada Zero (models, relationships, queries, permissions)

**Status:** ✅ concluída — [handoff](../handoffs/04-camada-zero.md) · **Pré-requisito humano:** — · É a fase mais pesada do plano.

> **Atualizado pela Fase 3** — ler antes de começar:
> [`../handoffs/03-modelo-de-dados.md`](../handoffs/03-modelo-de-dados.md) traz a lista de
> colunas de cada tabela, a tabela de conversão Drizzle→Zero e as constraints que
> estouram erro de mutation. As seções abaixo marcadas **[Fase 3]** foram corrigidas.

## Escopo

Um arquivo por tabela em `src/data/models/`, no padrão
`table().columns().primaryKey()` + `serverWhere` + `mutations()`. O exemplo funcional
completo (o antigo `todo`) está preservado no handoff da Fase 2. Depois:
`bun zero:generate`.

Relacionamentos em `src/data/relationships.ts` — além dos óbvios (`post.user`,
`post.comments`, `post.media`, `course.modules`, `lesson.progress`), o que destrava o
gate de acesso:

```ts
// post → subscription, via o criador do feed
subscriptions: many({
  sourceField: ['feedOwnerId'],
  destSchema: tables.subscription,
  destField: ['creatorId'],
})
```

## O gate de acesso (peça central)

**Por que não no JWT:** `src/features/auth/server/authServer.ts:50` configura o JWT com
`expirationTime: '3y'` — o Takeout faz isso de propósito para não ter que renovar token
na conexão do Zero. Qualquer claim de entitlement embutida no token ficaria congelada
por 3 anos. Então o gate tem que ser um **join server-side**, não uma claim.

Permission reutilizável em `src/data/where/canAccessContent.ts`:

```ts
export const canAccessPost = serverWhere('post', (q, auth) => {
  if (!auth?.id) return false
  if (auth.role === 'admin') return true
  return q.or(
    q.cmp('visibility', 'public'),
    q.exists('subscriptions', (s) =>
      s.where('userId', auth.id).where('status', 'IN', ['active', 'trialing'])
    )
  )
})
```

Duas notas de implementação:
- Filtrar por **`status`**, não por `currentPeriodEnd > Date.now()` — comparação com
  "agora" dentro de permission quebra a convergência client/server que `docs/zero.md`
  exige. Quem mantém `status` correto é o webhook + um job que vira `active` → `expired`.
- **[Fase 3] A sintaxe está confirmada, não precisa checar.** O expression builder do
  `@rocicorp/zero` 0.26.2 expõe `or`, `and`, `not`, `cmp`, `cmpLit` e `exists`
  (`zql/src/query/expression.d.ts`), e `IN` / `NOT IN` são operadores válidos
  (`zero-protocol/src/ast.d.ts:21`). `_.or` + `_.cmpLit` já aparecem em
  `src/data/models/user.ts`. Atenção: comparar um valor do `auth` (ex.: `auth.role`)
  usa **`cmpLit`**, não `cmp` — `cmp` espera nome de coluna no primeiro argumento.

Mesma permission (adaptada) para `course`, `lesson` (com bypass em `freePreview`) e
`media`. `lessonProgress`, `comment` e `reaction` seguem o padrão do antigo `todo`:
`q.cmp('userId', auth.id)` para escrita.

## Queries

Em `src/data/queries/`, já com `.related()` completo. `docs/zero.md` é explícito: a
query de índice deve carregar tudo que a tela de detalhe precisa, pro cache local
resolver a navegação instantaneamente.

## Se ficar grande demais

Corte natural: *models + relationships* primeiro, *queries + permissions* depois, com um
handoff entre as duas metades.

## Verificação

`bun zero:generate` + `bun check types`.

⚠️ **[corrigido na execução] O teste do gate não pode ser feito nesta fase.** O Zero só
sincroniza o que uma `useQuery` montada pede — sem tela consumindo `feedPosts`, o
payload de sync é vazio para todo mundo, assinante ou não, e `?debug=2` não mostra nada.
O `zero_cvr` fica literalmente sem tabelas. O teste dos dois usuários é válido, mas
**depende de um consumidor**: ou uma rota-sonda descartável, ou a primeira tela da
Fase 6.

## [Fase 3] O que já existe no banco

Tabelas replicadas pro Zero (todas com `id` como primary key, exceto `userState`, que
usa `userId`):

`userPublic`, `userState`, `plan`, `subscription`, `media`, `post`, `postMedia`,
`comment`, `reaction`, `course`, `courseModule`, `lesson`, `lessonProgress`.

`payment` é **privada** — não entra na publication, não tem model Zero, só server action.

Colunas de cada uma: [`../handoffs/03-modelo-de-dados.md`](../handoffs/03-modelo-de-dados.md).
Conversão de tipos (resumo): `text` → `string()`, nulável → `.optional()`,
`text({ enum })` → `enumeration<'a' | 'b'>()`, `integer` → `number()`,
`boolean` → `boolean()`, `timestamp({ mode: 'string' })` → `number()` (epoch ms).

## [Fase 3] Decidir antes de escrever as queries: de onde vem o `feedOwnerId`

O plano original mandava pôr o id do usuário mestre em
`src/server/constants-server.ts`. **Não serve:** tudo em `src/server/` é server-only por
convenção (o vizinho `env-server.ts` chega a lançar erro se for importado no browser) e
hoje só é consumido por `apiHandler.ts` e `getIsAdmin.ts`. A query do feed roda no
cliente. Opções:

1. `VITE_MASTER_USER_ID` no `.env.development` + um `src/constants.ts` isomórfico.
   O id vai embutido no bundle — é um id público, sem problema de segurança. Mais
   simples, e é a recomendação.
2. Uma linha de config lida via Zero. Mais flexível (troca sem rebuild), mais código.

Seja qual for, o valor precisa existir como usuário de verdade no banco — hoje **não
existe seed nenhum**. Registrar no handoff como o usuário cria/descobre esse id.

## [Fase 3] Detalhes de implementação que economizam tempo

- **`src/data/relationships.ts` tem um array manual `allRelationships`.** Todo
  `relationships()` novo precisa ser adicionado lá, senão o `createSchema` de
  `src/data/schema.ts` não enxerga a relação.
- **Relações ambíguas.** `subscription` aponta duas vezes pra `userPublic`
  (`userId` e `creatorId`) e `comment` aponta pra si mesma (`parentId`). No Drizzle isso
  exigiu `alias`; no Zero, são só nomes de relação diferentes — use os mesmos nomes do
  `src/database/relations.ts` (`user`/`creator`, `parent`/`replies`) pra não ter dois
  vocabulários.
- **Curtida é toggle, não insert.** Existe
  `reaction_postId_userId_type_uidx`: inserir duas vezes estoura. Mesma coisa pra
  `lessonProgress` (único por `userId` + `lessonId`, use upsert).
- **`post.likeCount` / `post.commentCount` são denormalizados.** Quem atualiza é a
  mutation, na mesma transação do insert/delete de `reaction`/`comment`.
- **`deleted` é soft delete** em `post` e `comment` — as queries precisam filtrar
  `deleted = false`, e a permission não faz isso por você.
- **`lesson.freePreview`** é o bypass do gate: uma lição com `freePreview = true`
  aparece mesmo num curso `subscribers`.
