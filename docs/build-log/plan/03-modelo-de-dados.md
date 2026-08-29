# Fase 3 — Modelo de dados

**Status:** ✅ concluída — [handoff](../handoffs/03-modelo-de-dados.md) · **Pré-requisito humano:** — · **Anterior:** [`../handoffs/02-limpar-demo.md`](../handoffs/02-limpar-demo.md)

## Escopo

Tudo em `src/database/schema-public.ts` (exposto ao Zero), exceto `payment` que vai em
`schema-private.ts`. Depois: `bun migrate`.

Tabelas que já existem: `userPublic`, `userState` (públicas); `user`, `account`,
`session`, `jwks` (privadas, do Better Auth).

### Conteúdo
- `post` — `id, feedOwnerId, kind('text'|'photo'|'video'|'audio'), title?, body?,
  visibility('public'|'subscribers'), requiredPlanId?, published, publishedAt,
  likeCount, commentCount, deleted, createdAt`
- `media` — `id, ownerId, provider('r2'), storageKey, posterKey?, mime, kind, sizeBytes,
  durationSec?, width?, height?, status('pending'|'ready'|'failed'), createdAt`
- `postMedia` — `id, postId, mediaId, position` (post carrossel/multi-mídia)
- `comment` — `id, postId, userId, parentId?, body, deleted, createdAt`
- `reaction` — `id, postId, userId, type, createdAt` + índice único `(postId, userId, type)`

### Cursos
- `course` — `id, feedOwnerId, slug, title, description, coverMediaId?, visibility,
  requiredPlanId?, published, order, createdAt`
- `courseModule` — `id, courseId, title, order`
- `lesson` — `id, courseId, moduleId?, title, body?, mediaId?, durationSec?, order,
  published, freePreview(boolean), createdAt`
- `lessonProgress` — `id, userId, lessonId, positionSec, completedAt?, updatedAt`

### Assinatura
- `plan` — `id, slug, name, priceCents, currency('BRL'), interval('month'|'year'),
  active, order`
- `subscription` — `id, userId, creatorId, planId, provider('manual'|'stripe'|'asaas'|…),
  providerSubscriptionId?, status('trialing'|'active'|'past_due'|'canceled'|'expired'),
  currentPeriodEnd, cancelAtPeriodEnd, createdAt, updatedAt`
- `payment` (**privada**, só admin via server action) — `id, userId, subscriptionId,
  provider, providerPaymentId, amountCents, currency, status, paidAt`

## `feedOwnerId` / `creatorId` não são supérfluos

São a **chave de junção que torna o paywall possível no Zero** (ver Fase 4) — sem eles
não existe relacionamento `post → subscription`. Bônus: deixam a porta aberta pra mais
de um criador sem migration destrutiva. Valor = id do usuário mestre, vindo de uma
constante em `src/server/constants-server.ts`.

## Não esquecer

Além das tabelas novas, também registrar os relacionamentos Drizzle em
`src/database/relations.ts` — a Fase 2 deixou lá só `user`/`account`/`session`/
`userPublic`/`userState`.

Esta é a fase que gera o `DROP TABLE todo`, herdado da Fase 2.

## Verificação

`bun migrate` aplica; conferir as tabelas via `psql` no postgres **:5533**
(o README diz 5444 — está errado).
