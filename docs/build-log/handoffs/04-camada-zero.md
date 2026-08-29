# Fase 4 — Camada Zero

## Objetivo

Levar as 11 tabelas novas para o Zero: models com mutations, relacionamentos, o gate de
acesso do paywall e as queries que as telas vão consumir.

## Feito

**Criado — `src/data/models/`** (11 arquivos, um por tabela)

`plan.ts`, `subscription.ts`, `media.ts`, `post.ts`, `postMedia.ts`, `comment.ts`,
`reaction.ts`, `course.ts`, `courseModule.ts`, `lesson.ts`, `lessonProgress.ts`.

Todos no padrão `table().columns().primaryKey()` + `serverWhere` de **escrita** +
`mutations()`. Mutations customizadas só onde o CRUD gerado não serve:

| Model | Mutation | Por quê |
|---|---|---|
| `post` | `softDelete`, `publish` | `deleted` em vez de DELETE; `publishedAt` vem do cliente |
| `comment` | `insert`, `softDelete` | mantêm `post.commentCount` na mesma transação |
| `reaction` | `toggle` | o índice único faz insert repetido estourar — tem que procurar antes |
| `lessonProgress` | `save` | upsert por `(userId, lessonId)`, mesmo motivo |

**Criado — [`src/data/where/canAccessContent.ts`](../../../src/data/where/canAccessContent.ts)**

O gate. `postGate` e `courseGate` são funções puras sobre o `ExpressionBuilder`,
reaproveitadas por dentro de `exists()` pelas tabelas penduradas (comment, reaction,
postMedia, courseModule, lesson) — assim a regra existe **uma vez**. Exporta
`canAccessPost`, `canAccessCourse`, `canAccessLesson`, `canAccessCourseModule`,
`canAccessComment`, `canAccessReaction`, `canAccessPostMedia`, `canAccessMedia`,
`canAccessOwnSubscription`, `canAccessOwnProgress`, `canAccessPlan`.

**Criado — `src/data/queries/`**
- `feed.ts` — `feedPosts`, `postDetail`, `feedPostsPage` (cursor)
- `course.ts` — `courses`, `courseDetail`, `lessonDetail`, `lessonsInProgress`
- `subscription.ts` — `activePlans`, `mySubscriptions`, `activeSubscription`

**Criado — [`src/constants/creator.ts`](../../../src/constants/creator.ts)**
`MASTER_USER_ID` e `ACTIVE_SUBSCRIPTION_STATUSES`.

**Editado**
- [`src/data/relationships.ts`](../../../src/data/relationships.ts) — 13 blocos,
  `allRelationships` completo.
- [`.env.development`](../../../.env.development) — `VITE_MASTER_USER_ID=""`.

**Verificação que rodei:** parse de TypeScript nos 19 arquivos (sem erro de sintaxe) e
conferência cruzada, via AST, de todo nome de relação usado em `exists()` / `.related()`
contra o que `relationships.ts` declara. **Não rodei typecheck completo** — não dá: até
o `bun zero:generate` rodar, `src/data/generated/tables.ts` não conhece as tabelas novas
e o `Schema` do on-zero não tem `'post'`, `'course'` etc.

## Decisões

**1. O `feedOwnerId` vem de `VITE_MASTER_USER_ID`, num constante isomórfico.**
O plano mandava pôr em `src/server/constants-server.ts`, mas a query do feed roda no
cliente e tudo em `src/server/` é server-only. O id vai embutido no bundle — é público
de qualquer jeito, aparece em todo post sincronizado. As queries recebem `feedOwnerId`
como prop; quem passa a constante é a tela.

**2. O paywall respeita `requiredPlanId` — com um join de duas colunas.**
Permission do Zero não compara coluna com coluna (`subscription.planId = post.requiredPlanId`
é inexprimível). A saída foi declarar duas relações no post e no curso:

```ts
creatorSubscriptions: many({ sourceField: ['feedOwnerId'], destField: ['creatorId'] })
planSubscriptions:    many({ sourceField: ['feedOwnerId', 'requiredPlanId'],
                             destField:   ['creatorId', 'planId'] })
```

e ramificar no gate: `requiredPlanId IS NULL` → qualquer assinatura ativa serve;
`IS NOT NULL` → a assinatura tem que ser **daquele plano**. É o que faz o curso
"Incluído no plano Anual" do mock funcionar de verdade.

**3. Permission de leitura ≠ permission de escrita.** `mutations(schema, canWrite)`
recebe a de escrita (dono do feed para conteúdo, dono da linha para comment/reaction/
progress, `false` para `plan` e `subscription`). A de leitura fica em `where/` e é
aplicada nas queries. O `todo` do Takeout confundia as duas porque nele read == write.

**4. Admin não aparece em nenhuma permission.** `src/zero/server.ts` já tem
`defaultAllowAdminRole: 'all'` — quem tem `role === 'admin'` passa por cima de query e
de mutation. Repetir `role === 'admin'` em 11 arquivos seria 11 lugares para errar.
⚠️ Isso mantém vivo o risco do JWT de 3 anos: promover alguém a admin não faz efeito até
o token renovar.

**5. Rascunho pertence ao dono.** O gate começa com `cmp('feedOwnerId', userId)`, então o
criador enxerga o que é dele mesmo despublicado ou apagado. Os outros só veem
`published && !deleted`.

**6. Contadores sobem dentro da transação da mutation.** `comment.insert` lê o post e
grava `commentCount + 1`; `reaction.toggle` idem com `likeCount`. Nada de `Date.now()`
nem `newId()` dentro de mutation — id e timestamp sempre vêm do cliente, senão as duas
execuções (otimista e autoritativa) divergem.

**7. As queries filtram `deleted`/`published` de novo,** mesmo com a permission já
filtrando no servidor. Não é redundância à toa: a permission decide o que **sincroniza**,
o `.where()` protege o **cache local**, onde uma mutation otimista cria a linha antes de
o servidor responder.

## Comandos pro usuário rodar

De `/mnt/f/apps/bubble-app/mobile-bubble-app`:

```bash
bun zero:generate
```
→ regenera `src/data/generated/*` com as 13 tabelas e roda `lint:fix` no fim.
**É o comando que faz o projeto compilar.** `generated/tables.ts` tem que passar a
exportar `post`, `course`, `lesson`, … Se ele reclamar dos argumentos das mutations
customizadas (`toggle`, `save`, `publish`, `softDelete`), é o gerador de validators
valibot tropeçando nos tipos — me mande a mensagem.

```bash
bun check types
```
→ typecheck limpo. Este é o primeiro momento em que a Fase 4 é validada de verdade.

```bash
bun backend
```
→ deixe rodando. Se já estiver no ar, **reinicie**: o zero-cache carrega o schema na
subida e não vai enxergar as tabelas novas sem isso.

Agora o passo humano:

```bash
docker compose exec pgdb psql -U user -d postgres -c 'SELECT id, email FROM "user" ORDER BY "createdAt"'
```
→ pegue o id da conta que vai ser o **criador** e ponha em `.env.development`:
`VITE_MASTER_USER_ID="<id>"`. Sem isso o feed abre vazio — e é o comportamento correto,
não um bug.

```bash
bun dev
```
→ web em `:8081`. Nesta fase **nenhuma tela consome as queries ainda** (isso é a Fase 6),
então o que se espera é: app sobe, feed continua com "No posts yet.", **sem erro no
console do zero**.

### Teste do gate — EXECUTADO, passou

Resultado e método estão no [`STATE.md`](../STATE.md). O caminho que funciona é ler
`"zero_0/cvr".rows` no banco `zero_cvr` (coluna `refCounts`), não a tela: mostra o que o
servidor entregou a cada `clientGroupID`, sem precisar de UI montada.

Foi preciso uma sonda temporária no lugar do placeholder do feed para que alguma
`useQuery` existisse — depois revertida com `git checkout`. Registro do erro original:

### (roteiro antigo) O teste não é executável sem um consumidor

⚠️ Escrevi este roteiro assumindo que bastava abrir o feed com `?debug=2`. **Está
errado.** O Zero é orientado a query: ele sincroniza só o que uma `useQuery` montada
pede. Como nenhuma tela consome `feedPosts` ainda, o payload é vazio para todos e o
banco `zero_cvr` não chega nem a criar tabela. Verificado no navegador.

O roteiro abaixo continua correto, mas precisa de um consumidor da query — uma
rota-sonda descartável, ou a primeira tela da Fase 6. Dados e contas já estão no banco:

1. crie um `plan` e um `post` com `feedOwnerId = <criador>`, `published = true`,
   `visibility = 'subscribers'`, `requiredPlanId = NULL`;
2. entre com a **conta B** (sem assinatura) e abra `http://localhost:8081/home/feed?debug=2`;
3. no payload de sync do zero, a linha do post **não pode aparecer** — não basta a tela
   estar vazia;
4. insira `subscription` com `userId = B`, `creatorId = <criador>`, `status = 'active'`;
   a linha tem que aparecer sem recarregar a página;
5. troque o post para `requiredPlanId = <id de outro plano>`: a linha tem que **sumir**
   de novo. É este passo que prova o join de duas colunas.

## Não feito

- **Nada de UI.** Fase 6 e 7.
- **Nenhum seed.** Não existe `plan`, nem post, nem usuário mestre — daí o passo manual
  acima. Um script de seed seria útil e não estava no plano; sugiro para a Fase 6.
- **`media` tem gate mais frouxo que `post`.** Quem assina o criador recebe as linhas de
  `media` dele, **ignorando `requiredPlanId`**. O que vaza é `storageKey`, não o arquivo.
  Isso empurra uma responsabilidade explícita para a Fase 5: **checar o tier de novo na
  hora de assinar a URL do R2** — está escrito em `plan/05`.
- **`exists` aninhado dentro de `exists` não foi validado em runtime.** `canAccessLesson`
  e `canAccessComment` chamam o gate por dentro de um `exists`, o que vira EXISTS dentro
  de EXISTS. A sintaxe compila; se o zero-cache reclamar de profundidade, o plano B é
  desnormalizar `feedOwnerId`/`visibility` na `lesson`.
- **Paginação só no feed.** Cursos e comentários usam `limit` fixo.

## Contrato pro próximo

### Constantes

```ts
import { MASTER_USER_ID, ACTIVE_SUBSCRIPTION_STATUSES } from '~/constants/creator'
```

### Queries disponíveis

```ts
import { feedPosts, postDetail, feedPostsPage } from '~/data/queries/feed'
import { courses, courseDetail, lessonDetail, lessonsInProgress } from '~/data/queries/course'
import { activePlans, mySubscriptions, activeSubscription } from '~/data/queries/subscription'

const { user } = useAuth() // useAuth, nunca useUser — useUser cria waterfall
const [posts] = useQuery(feedPosts, {
  feedOwnerId: MASTER_USER_ID,
  userId: user?.id || '',
  limit: 20,
})
```

`feedPosts` já traz `feedOwner`, `media[].media`, os 3 primeiros `comments` com autor e a
`reactions` **do próprio usuário** (array vazio = não curtiu). `postDetail` tem a mesma
forma com 100 comentários e as respostas — navegar da lista para o detalhe resolve no
cache local.

### Mutations

```ts
import { newId } from '~/helpers/id'

// curtir/descurtir — o id só é usado se ainda não existe reação
zero.mutate.reaction.toggle({
  id: newId(), postId, userId, type: 'like', createdAt: Date.now(),
})

// comentar (o contador do post sobe junto)
zero.mutate.comment.insert({
  id: newId(), postId, userId, parentId, body, deleted: false, createdAt: Date.now(),
})

zero.mutate.comment.softDelete({ id })
zero.mutate.post.softDelete({ id })
zero.mutate.post.publish({ id, publishedAt: Date.now() })

// progresso do player (upsert)
zero.mutate.lessonProgress.save({
  id: newId(), userId, lessonId, positionSec, updatedAt: Date.now(), completedAt,
})
```

`Date.now()` e `newId()` sempre **na tela**, nunca dentro da mutation.

Tipos dos argumentos: `ToggleReactionArgs`, `SaveProgressArgs`, `PublishPostArgs`,
`PostIdArgs`, `CommentIdArgs` — exportados dos models e re-exportados por
`src/data/types.ts`.

### Quem pode escrever o quê

| Tabela | Escreve |
|---|---|
| `post`, `course`, `courseModule`, `lesson`, `postMedia` | só o dono do feed |
| `media` | só o dono da mídia |
| `comment`, `reaction`, `lessonProgress` | só o dono da linha |
| `plan`, `subscription` | ninguém pelo cliente — admin ou server action |

### Relações que a UI vai usar

`post`: `feedOwner`, `media[].media`, `comments[].user`, `comments[].replies`, `reactions`, `requiredPlan`
`course`: `coverMedia`, `requiredPlan`, `modules[].lessons`, `lessons[].progress`
`lesson`: `course`, `module`, `media`, `progress`
`subscription`: `plan`, `creator`

`creatorSubscriptions` e `planSubscriptions` (em `post` e `course`) existem **só para o
gate** — não use em `.related()`, isso sincronizaria assinatura de terceiro para o
cliente.
