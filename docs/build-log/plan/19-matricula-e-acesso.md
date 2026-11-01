# Fase 19 — Matrícula e acesso ao curso

**Status:** ✅ entregue (01/11/2026) · **Pré-requisito humano:** — · **Depende de:** 18 ✅ (entregue: a aula já tem
vídeo e texto, então dá para provar o acesso ponta a ponta com `aula-objecoes`)

## Objetivo

Acesso a curso deixa de ser deduzido da assinatura e passa a ser uma **matrícula**: uma
linha por (pessoa, curso), com origem e data.

## Por que esta fase existe

Hoje `courseAccess` chama `tierAllows`, que pergunta "esta pessoa assina o criador?". Com
isso não dá para representar três coisas que o produto precisa:

1. **Retroativo.** Quem assinou em março querendo um curso de janeiro. A regra decidida:
   a assinatura cobre o que o curso declarar, e o curso antigo é **comprado avulso**.
2. **Acesso que não vem de assinatura** — compra avulsa, cortesia do admin, curso grátis.
3. **"Desde quando esta pessoa tem este curso"**, que é a pergunta de todo suporte, e a
   lista de inscritos, que hoje não existe.

🔴 **Matrícula materializada, não derivada.** Calcular a janela a cada leitura faz a
resposta mudar sozinha quando a pessoa renova ou o criador republica o curso. Uma linha
responde "por quê" e não se move.

🔴 **E criada por um ato explícito** (`POST /api/enroll`, o botão "Começar o curso"). É o
que a palavra inscrição quer dizer, é o que torna a tela "Inscritos" honesta, e evita
escrita escondida dentro de um `GET`.

## Escopo

### 1. Schema

```ts
// src/database/schema-public.ts

course {
  // ...
  publishedAt: timestamp('publishedAt', { mode: 'string' })      // NOVO
  subscriberAccess: text('subscriberAccess', {
    enum: ['included', 'since-subscription', 'none'],
  }).notNull().default('included')                                // NOVO
}

enrollment = pgTable('enrollment', {
  id: text().primaryKey(),
  userId: text().notNull().references(() => userPublic.id, { onDelete: 'cascade' }),
  courseId: text().notNull().references(() => course.id, { onDelete: 'cascade' }),
  source: text({ enum: ['subscription', 'purchase', 'grant', 'free'] }).notNull(),
  // por onde a revogação encontra o que revogar
  subscriptionId: text().references(() => subscription.id, { onDelete: 'set null' }),
  grantedBy: text(),                      // userId do admin, quando source = 'grant'
  createdAt: timestamp().defaultNow().notNull(),
  revokedAt: timestamp(),                 // null = ativa
}, (t) => [
  uniqueIndex('enrollment_userId_courseId_uidx').on(t.userId, t.courseId),
  index('enrollment_courseId_idx').on(t.courseId),
  index('enrollment_subscriptionId_idx').on(t.subscriptionId),
])
```

⚠️ **`paymentId` NÃO entra em `enrollment`.** `payment` é tabela privada (invariante 1) e
`enrollment` é pública: guardar o id do pagamento na linha pública vazaria encanamento de
cobrança para o cliente. O elo vai no outro sentido, na Fase 20 — `payment` ganha
`courseId`.

### 2. Migration **com backfill** — a parte que quebra produção se esquecer

Duas, na mesma migration:

```sql
-- 1. todo curso publicado precisa de data, senão a comparação com NULL devolve NULL
UPDATE "course" SET "publishedAt" = COALESCE("publishedAt", "createdAt", now())
WHERE "published" = true AND "publishedAt" IS NULL;

-- 2. quem já assina não pode perder acesso no deploy
INSERT INTO "enrollment" (id, "userId", "courseId", source, "subscriptionId", "createdAt")
SELECT gen_random_uuid()::text, s."userId", c.id, 'subscription', s.id, now()
  FROM "subscription" s
  JOIN "course" c ON c."feedOwnerId" = s."creatorId"
 WHERE s.status IN ('active', 'trialing')
   AND c.published = true
   AND (c."requiredPlanId" IS NULL OR c."requiredPlanId" = s."planId")
ON CONFLICT DO NOTHING;
```

🔴 É o mesmo defeito que a migration `20260923115502_publishedat_backfill` veio consertar
no feed: **`publishedAt` nulo some da comparação sem erro nenhum**. E sem o segundo
`INSERT`, todo assinante ativo abre o app depois do deploy e descobre que perdeu os
cursos.

Carimbar a data ao publicar daí em diante: `coalesce(publishedAt, now())` em
`setCoursePublished`, exatamente como `setPostPublished` já faz — republicar não reescreve
a data original.

### 3. `Viewer` passa a carregar a assinatura, não só o `Set`

A regra `since-subscription` precisa de **quando** a assinatura começou, e
[`loadViewer`](../../../src/server/access/viewer.ts) hoje guarda só `creators` e `plans`.

Acrescente `subscriptions: Map<creatorId, { id, planId, startedAt }>` — **da mesma
query**, sem round-trip novo — e construa `creators`/`plans` a partir dela. Uma leitura,
uma verdade, e os dois `Set` continuam existindo porque `tierAllows` os usa como busca
O(1).

### 4. A regra do retroativo, pura e testada

Arquivo novo `src/features/courses/courseAccessRules.ts` (ou dentro de
`contentAccess.ts`, se preferir manter junto), sem I/O:

```ts
export type SubscriberAccess = 'included' | 'since-subscription' | 'none'

/** A assinatura ativa cobre este curso? Não decide acesso — decide se pode MATRICULAR. */
export function subscriberAccessAllows(
  course: { subscriberAccess: SubscriberAccess; publishedAt: number | null },
  subscription: { startedAt: number } | null,
): boolean
```

| `subscriberAccess` | assinatura ativa | sem assinatura |
|---|---|---|
| `included` | matricula | compra avulso ou assina |
| `since-subscription` | matricula **se** `course.publishedAt >= subscription.startedAt` | idem |
| `none` | compra avulso, mesmo assinando | compra avulso |

Casos de borda que o teste tem que cobrir, porque valem dinheiro: `publishedAt` nulo
(nega, não libera), curso publicado no **mesmo instante** da assinatura (libera —
comparação `>=`), assinatura nula, `requiredPlanId` diferente do plano assinado.

### 5. `courseAccess` passa a olhar a matrícula

[`contentAccess.ts`](../../../src/server/access/contentAccess.ts) é **puro de propósito**
("nada de I/O, nada de SQL") e continua assim: quem carrega as matrículas é o endpoint, em
**uma** query com `inArray` (invariante 12 — número constante de queries), e passa um
`Set` adiante.

```ts
courseAccess(viewer, course, enrolled: ReadonlySet<string>): Access
```

Ordem: privilegiado → não publicado nega → `visibility = 'public'` libera → matrícula
ativa libera → nega.

`LockReason` ganha **`needs-purchase`**: é o que diz à tela para oferecer "Comprar este
curso" em vez de "Assinar". O mapa do motivo também vira função pura:

- sem assinatura e o curso não é `none` → `needs-subscription`
- assina, mas `requiredPlanId` é de outro plano → `needs-plan` (comportamento de hoje)
- assina e o curso é `none`, ou é `since-subscription` e veio antes → **`needs-purchase`**

`lessonAccess` não muda de forma: continua "aula grátis em curso publicado, ou o que o
curso disser" — mas o "o que o curso disser" agora é a matrícula.

### 6. `POST /api/enroll`

Corpo `{ courseId }`. O servidor decide, nesta ordem, e **nunca confia no cliente**
(invariante 3):

1. curso existe e está publicado — senão 404;
2. já existe matrícula ativa → devolve ela (idempotente, o botão pode ser clicado duas
   vezes);
3. curso `public` → matricula com `source: 'free'`;
4. `subscriberAccessAllows(course, viewer.subscriptions.get(creatorId))` **e** o tier
   (`requiredPlanId`) → matricula com `source: 'subscription'` e o `subscriptionId`;
5. senão → **422 `needs-purchase`**. O preço ainda não existe nesta fase (é da 20): aqui
   o código é só o sinal de que a tela deve oferecer compra em vez de assinatura.

Matrícula revogada que volta a ter direito: reative a linha (`revokedAt = null`) em vez de
criar outra — o índice único é por (userId, courseId), e o histórico de "já esteve aqui" é
útil.

### 7. Revogação — um helper, três chamadas

`revokeEnrollmentsForSubscription(subscriptionId)` em
`src/features/billing/server/` : marca `revokedAt = now()` nas matrículas com
`source = 'subscription'` **daquele** `subscriptionId`. Compra e concessão não são
tocadas — foi a decisão: *perde o acesso, mas o que comprou é seu*.

Chamado de todos os lugares onde uma assinatura deixa de ser ativa:

1. [`revokeSubscription.ts`](../../../src/features/billing/server/revokeSubscription.ts)
   (revogar pelo admin);
2. `app/api/cron/expire-subscriptions+api.ts` (vencimento);
3. o caminho do webhook que grava `canceled` / `unpaid` / `incomplete_expired`
   (`subscriptionActions.ts`).

🔴 Espalhar essa regra por três implementações é exatamente como o `provider.cancel()`
ficou faltando por duas fases, cortando acesso e deixando a cobrança correr. **Um lugar.**

### 8. Telas

**Admin — curso** (`app/(app)/admin/courses/[courseId].tsx`): bloco "Quem tem acesso",
com `OptionRow` para `subscriberAccess` e o texto que explica cada opção em uma linha. O
preço avulso é da Fase 20; aqui o terceiro valor (`none`) aparece com o aviso de que sem
preço o curso fica inalcançável.

**Admin — inscritos**: lista por curso (nome, origem da matrícula, data, revogada ou
não), mais conceder e revogar à mão (`source: 'grant'`). Reaproveite a forma de
`app/(app)/admin/people.tsx`, que já faz conceder/revogar assinatura — inclusive o
cuidado de ler a role do Postgres, não do JWT.

**Aluno — detalhe do curso**
(`app/(app)/home/(tabs)/courses/[courseSlug]/index.tsx`): o botão passa a depender do
estado, e o currículo continua visível nos três — é ele que vende.

| Estado | Botão |
|---|---|
| matriculado | "Começar o curso" / "Continuar" (como hoje) |
| pode matricular | **"Começar o curso"** → `POST /api/enroll` → entra |
| `needs-subscription` | "Assinar para abrir as aulas" (como hoje) |
| `needs-plan` | "Ver planos que incluem este curso" (como hoje) |
| `needs-purchase` | "Comprar este curso" — na Fase 20 ganha preço e checkout; aqui pode levar a `/assinar` com um aviso |

O DTO do curso ganha `enrolled: boolean` e mantém `locked`/`lockReason`. **Nenhuma tela
recalcula a regra** — elas leem o DTO, como o feed já faz.

## Qualidade e teste

**Reaproveitar, nominalmente:** `WriteResult` + `requireContentAdmin` + `fail`/`FAIL`
(`src/server/api/respond.ts`), `loadViewer`, `tierAllows` (continua decidindo o plano),
`AdminSection`/`AdminActionBar`, `OptionRow`, `~/helpers/apiFetch`, e o padrão de
`grantSubscription` para a concessão manual.

**Funções puras com teste** — é a fase em que mais importa, porque decide acesso:
`subscriberAccessAllows`, o mapa de `LockReason` e `courseAccess` (que já é pura e tem
teste em `src/test/unit/content-access.test.ts` — **estenda esse arquivo**, não crie
outro).

**Prova no Postgres** para cada escrita: matrícula criada com a origem certa, revogação
atingindo só `source = 'subscription'`, backfill não deixando assinante sem curso.

**Teste de navegador** com as três contas (`src/constants/devAccounts.ts`): Assinante,
Visitante e Criador veem três botões diferentes na mesma tela.

**Sem `any` em código novo.**

## Verificação

1. `bun run migrate:build && bun backend` — conferir que a migration aplicou e que
   `select count(*) from enrollment` já vem **maior que zero** (o backfill)
2. `select id, published, "publishedAt" from course` — nenhuma linha publicada com data
   nula
3. **Assinante** (atalho na tela de login) abre um curso `included` → "Começar o curso" →
   `select * from enrollment where "userId" = ...` mostra `source = 'subscription'` com o
   `subscriptionId` preenchido
4. Mudar o curso para `since-subscription` e recuar a data:
   `update course set "publishedAt" = now() - interval '60 days'`, depois revogar e
   recriar a assinatura do Assinante — a tela passa a dizer **"Comprar este curso"**
5. **Visitante** no mesmo curso → "Assinar para abrir as aulas"
6. Revogar a assinatura do Assinante pelo `/admin/people` → `select "revokedAt" from
   enrollment` preenchido, e a aula volta a ficar fechada **na CVR do servidor**, não só
   na tela
7. Conceder à mão pela tela de inscritos → `source = 'grant'`, e revogar a assinatura
   depois **não** derruba essa matrícula
8. `bun check types` limpo · `bun test:unit` passando
9. **Comitar a versão funcionando**, com "Conhecido e NÃO resolvido"

## Não é desta fase

- **Cobrança do curso avulso** — Fase 20. Aqui o `needs-purchase` existe como estado e
  como texto, sem checkout
- **Certificado** — Fase 21
- **Matrícula com validade** (`expiresAt`): a compra avulsa de plano já expira por
  `subscription.currentPeriodEnd`; curso comprado é vitalício por decisão
- **Trilha / combo de cursos**
- **Fila de espera e turma com data** — este produto é conteúdo sob demanda
