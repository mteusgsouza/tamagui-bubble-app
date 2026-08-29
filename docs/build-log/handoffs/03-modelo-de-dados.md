# Fase 3 — Modelo de dados

## Objetivo

Criar no Drizzle todas as tabelas de conteúdo, cursos e assinatura, mais os
relacionamentos, deixando a migration pronta pro usuário gerar e aplicar.

## Feito

**Editado — [`src/database/schema-public.ts`](../../../src/database/schema-public.ts)**
(12 tabelas novas, todas replicadas pro Zero)

| Tabela | Colunas |
|---|---|
| `plan` | `id, slug, name, priceCents, currency, interval, active, order` |
| `subscription` | `id, userId, creatorId, planId, provider, providerSubscriptionId, status, currentPeriodEnd, cancelAtPeriodEnd, createdAt, updatedAt` |
| `media` | `id, ownerId, provider, storageKey, posterKey, mime, kind, sizeBytes, durationSec, width, height, status, createdAt` |
| `post` | `id, feedOwnerId, kind, title, body, visibility, requiredPlanId, published, publishedAt, likeCount, commentCount, deleted, createdAt` |
| `postMedia` | `id, postId, mediaId, position` |
| `comment` | `id, postId, userId, parentId, body, deleted, createdAt` |
| `reaction` | `id, postId, userId, type, createdAt` |
| `course` | `id, feedOwnerId, slug, title, description, coverMediaId, visibility, requiredPlanId, published, order, createdAt` |
| `courseModule` | `id, courseId, title, order` |
| `lesson` | `id, courseId, moduleId, title, body, mediaId, durationSec, order, published, freePreview, createdAt` |
| `lessonProgress` | `id, userId, lessonId, positionSec, completedAt, updatedAt` |

`userPublic` e `userState` ficaram intactas.

**Editado — [`src/database/schema-private.ts`](../../../src/database/schema-private.ts)**
- `payment` — `id, userId, subscriptionId, provider, providerPaymentId, amountCents,
  currency, status, paidAt, createdAt` + `export type Payment`.
- O arquivo passou a importar `subscription` de `./schema-public` (só import, não
  re-export — `migrate.ts` deriva a lista de tabelas privadas de
  `Object.values(schemaPrivate)`, então nada vazou pra lista).

**Editado — [`src/database/relations.ts`](../../../src/database/relations.ts)**
- Relações Drizzle de todas as tabelas novas, incluindo `user.payments` e
  `payment.user`/`payment.subscription`.

**Não gerei nenhum arquivo em `src/database/migrations/`** — quem roda `migrate:build`
é o usuário (comandos abaixo).

**Verificação que rodei:** `tsc --noEmit` restrito a `schema-public.ts`,
`schema-private.ts` e `relations.ts` — limpo. É typecheck, não toca em banco nem em
build. Não rodei `oxfmt` porque o binário nativo instalado é o de Linux (o repo foi
instalado do WSL) e não roda a partir do Windows; `bun lint:fix` do usuário resolve.

## Decisões

**1. Enums são `text`, não `pgEnum`.** Usei `text('kind', { enum: [...] })`: tipa em
TypeScript e continua sendo uma coluna `text` no Postgres. `pgEnum` viraria um tipo
Postgres próprio, com `ALTER TYPE` a cada valor novo e mapeamento incerto no
replication do Zero. Nenhuma tabela do repo usa `pgEnum` hoje. Na Fase 4, o equivalente
do lado Zero é `enumeration<'text' | 'photo' | ...>()` (existe em `@rocicorp/zero`,
confirmei em `zero-schema/src/builder/table-builder.d.ts`).

**2. `sizeBytes` é `integer` (int4), não `bigint`.** Teto de ~2,1 GB por arquivo — acima
de qualquer limite de upload que o app vá impor. `bigint` no Postgres chega no cliente
Zero como `BigInt`, o que não casa com a coluna `number()` do lado Zero. Trocar depois é
`ALTER COLUMN ... TYPE bigint`, não destrutivo.

**3. FKs apontam pra `userPublic`, não pra `user`.** `user` é privada: não é replicada
pro Zero, então uma relação `post → user` seria invisível no cliente. Só `payment`
(privada) referencia `user`. Todas as FKs de conteúdo são `onDelete: 'cascade'`;
`coverMediaId`, `lesson.mediaId` e `lesson.moduleId` são `set null` (perder a capa não
pode apagar o curso).

**4. `visibility` nasce com default `'subscribers'`.** Conteúdo esquecido no default fica
fechado, não aberto. `published` nasce `false` pelo mesmo motivo.

**5. Índice único do paywall.** `subscription_userId_creatorId_status_idx` é exatamente
o formato do join que a permission da Fase 4 vai fazer (`userId` + `creatorId` +
`status IN (...)`). Não é único de propósito: um usuário pode ter várias assinaturas ao
mesmo criador ao longo do tempo (uma `canceled`, uma `active`).

**6. `comment.parentId` é auto-referência** (`references((): AnyPgColumn => comment.id)`),
com alias `comment_thread` em `relations.ts` pra parear `parent` com `replies`. O mesmo
vale pro par `userPublic ↔ subscription`, que tem duas FKs (`userId` e `creatorId`) e
por isso precisa dos aliases `subscription_subscriber` / `subscription_creator` — sem
alias o Drizzle não consegue parear `one` com `many`.

**7. `order` é palavra reservada no SQL, e mesmo assim ficou `order`.** O plano pediu
esse nome; Drizzle e Zero sempre citam identificadores (`"order"`), então funciona. Se
algum dia der ruído, renomear é `ALTER TABLE ... RENAME COLUMN`, não destrutivo.

**8. Não criei a constante do usuário mestre.** O plano previa
`MASTER_USER_ID` em `src/server/constants-server.ts`, mas esse arquivo é **server-only**
e as queries do feed (`feedOwnerId = <mestre>`) rodam no cliente. Criar uma constante
server-only que a Fase 4 teria que mudar de lugar é pior do que não criar. A
recomendação está registrada em [`plan/04`](../plan/04-camada-zero.md).

## Comandos pro usuário rodar

Nesta ordem, de `/mnt/f/apps/bubble-app/mobile-bubble-app`:

```bash
bun run migrate:build
```
→ roda `drizzle-kit generate` e cria `src/database/migrations/<timestamp>_<nome>/`
(`migration.sql` + `snapshot.json`) mais o wrapper `.ts`. O `migration.sql` deve ter
**12 `CREATE TABLE`** (`plan`, `subscription`, `media`, `post`, `postMedia`, `comment`,
`reaction`, `course`, `courseModule`, `lesson`, `lessonProgress`, `payment`) e nenhum
`DROP TABLE` — o `DROP TABLE "todo"` já saiu na migration
`20260826004641_classy_moonstone`, gerada quando você rodou o backend depois da Fase 2.
**Se aparecer algum `DROP` inesperado, pare e reporte.**

```bash
bun backend
```
→ pgdb `:5533` healthy, migrate sai com 0 aplicando a migration nova, zero-cache `:4948`
de pé. No log do migrate deve aparecer
`[migrate] created publication zero_takeout for N tables` com **N = 13**: as 12 novas
menos `payment` (privada), mais `userPublic` e `userState`.

Conferir no banco:

```bash
docker compose exec pgdb psql -U user -d postgres -c "\dt"
```
→ 20 tabelas no schema `public`: as 13 replicadas + `user`, `account`, `session`,
`jwks`, `verification`, `payment` e `migrations`. Sem `todo`. (O zero-cache cria as
tabelas dele nos bancos `zero_cvr`/`zero_cdb`, fora dessa lista.)

```bash
docker compose exec pgdb psql -U user -d postgres -c "SELECT tablename FROM pg_publication_tables WHERE pubname='zero_takeout' ORDER BY 1"
```
→ **`payment` não pode estar na lista.** Se estiver, é bug: significa que ela vazou pra
lista pública.

```bash
bun check types
```
→ typecheck limpo. `src/data/generated/*` ainda não conhece as tabelas novas, mas isso
não quebra nada: nenhum código as importa ainda.

## Não feito

- **`bun zero:generate` não roda nada de novo agora.** Os models do Zero
  (`src/data/models/*.ts`) são a fonte do gerador, e criá-los é a Fase 4. Rodar
  `zero:generate` hoje só regenera o que já existe.
- **Nenhum seed.** Não existe linha de `plan` nem usuário mestre no banco. A Fase 9
  (billing) cria os planos; o usuário mestre é decisão da Fase 4 (ver abaixo).
- **`lesson` não tem `visibility` própria** — herda do `course`, com `freePreview` como
  única exceção. Foi o que o plano pediu.
- **Fase 1 (mover o repositório) segue pendente**, como estava.

## Contrato pro próximo

### Convenção de tipos: Drizzle → Zero

| Drizzle | Zero (`src/data/models/*.ts`) |
|---|---|
| `text().notNull()` | `string()` |
| `text()` (nullable) | `string().optional()` |
| `text({ enum: [...] })` | `enumeration<'a' \| 'b'>()` |
| `integer().notNull()` | `number()` |
| `integer()` (nullable) | `number().optional()` |
| `boolean().notNull()` | `boolean()` |
| `timestamp({ mode: 'string' }).notNull()` | `number()` (epoch ms) |
| `timestamp({ mode: 'string' })` (nullable) | `number().optional()` |

Toda tabela tem `id` como primary key e todo `id` vem de `newId()` no cliente.

### Tabelas públicas (o Zero enxerga)

`userPublic`, `userState`, `plan`, `subscription`, `media`, `post`, `postMedia`,
`comment`, `reaction`, `course`, `courseModule`, `lesson`, `lessonProgress`.

### Tabelas privadas (o Zero **não** enxerga)

`user`, `account`, `session`, `jwks`, `verification`, `payment`. Acesso só por server
action, via `getDb()` de `~/database`. Para `payment` existe `import type { Payment }
from '~/database/schema-private'`.

### O join do paywall existe

```
post.feedOwnerId ─┐
                  ├─→ subscription.creatorId + subscription.userId + subscription.status
course.feedOwnerId┘
```

Índice `subscription_userId_creatorId_status_idx` já cobre essa consulta.

### Defaults que importam nas mutations

`visibility='subscribers'`, `published=false`, `deleted=false`, `media.status='pending'`,
`subscription.provider='manual'`, `subscription.status='active'`, `plan.currency='BRL'`,
`plan.interval='month'`, `likeCount=0`, `commentCount=0`, `order=0`, `position=0`.

### Constraints que vão estourar erro de mutation

- `reaction_postId_userId_type_uidx` — curtir duas vezes viola o índice. A mutation de
  like tem que ser toggle (deletar se existe), não insert cego.
- `lessonProgress_userId_lessonId_uidx` — progresso é upsert por `(userId, lessonId)`.
- `postMedia_postId_mediaId_uidx` — a mesma mídia não entra duas vezes no mesmo post.
- `course_feedOwnerId_slug_uidx` e `plan_slug_uidx` — slug é único.

### Pendência que a Fase 4 tem que resolver primeiro

**De onde vem o `feedOwnerId`.** As queries do feed precisam do id do usuário mestre
**no cliente**, e `src/server/constants-server.ts` é server-only. Duas saídas:
`VITE_MASTER_USER_ID` no `.env` (fica embutido no bundle — é um id público, sem
problema), ou uma tabela/linha de config lida via Zero. Escolher antes de escrever as
queries.
