# Bubble App — estrutura inicial

## Contexto

Plataforma de conteúdo privado de um único criador ("usuário mestre"): feed com texto,
foto, vídeo e áudio + cursos, acessível só a inscritos, com dashboard admin para gerir
usuários, assinaturas e faturamento. Web + iOS + Android.

O ponto de partida já existe em `F:\apps\bubble-app\mobile-bubble-app\`: é o **Takeout
Free v2-beta** (sha `6f803743`, 2026-03-26), ainda com o app-demo de _todos_. O stack
já resolve boa parte do problema:

| Camada | O que o Takeout já entrega |
|---|---|
| Framework universal | **One** (`app/` roteia web + native, `app/api/` são rotas de servidor) |
| Dados / sync | **Zero** (Rocicorp) — queries reativas, permissions server-side, cache local |
| Banco | **Postgres + Drizzle** (`src/database/schema-public.ts` / `-private.ts`) |
| Auth | **Better Auth** (email/senha, magic link, plugin `admin` com roles) |
| UI | **Tamagui 2.0-rc** + Reanimated, componentes em `src/interface/` |
| Infra local | `docker-compose.yml` → postgres :5533 + zero-cache :4948 + migrate |

**Isso invalida a recomendação anterior de "backend separado / pnpm + turbo".** O
Takeout v2 é deliberadamente _single-package_ ("The entire project lives in a single
package.json to avoid monorepo complexity" — `docs/takeout.md`): a API, o app web, os
apps nativos e o admin saem todos deste projeto. O backend a construir não é um serviço
à parte — é `src/data/models/` (permissions + mutations) e `app/api/` (rotas HTTP).

**O que falta construir:** o modelo de domínio inteiro (posts, mídia, cursos,
assinaturas), o pipeline de mídia em R2 (o Takeout Free cita as env vars de R2 no
README mas **não tem código de upload** — só `scripts/helpers/env-load.ts` referencia),
o gate de acesso pago, e o dashboard admin.

---

## Decisões travadas

| Decisão | Escolha | Consequência |
|---|---|---|
| Repositório | **Repo único**, Takeout na raiz. Sem monorepo | O backend é `app/api` + `src/data/server` + Zero. Separar quebraria o Zero (ver Fase 1) |
| Pagamento | **Abstrair agora** (`plan`/`subscription` agnósticos + adapter) | O MVP usa concessão manual pelo admin; gateway pluga depois sem migration |
| Vídeo | **R2 + arquivo direto** | Sem transcoding/HLS/bitrate adaptativo. `media.provider` já modelado pra trocar depois |
| Escopo do MVP | **Fundação (feed + mídia) + cursos** | Paywall entra depois, mas o schema já nasce com `visibility`/`requiredPlanId` |

---

## Modelo de execução

**Uma fase por agente, em série.** Cada agente começa com contexto limpo, lê só o que
precisa, executa, verifica e escreve um handoff para o próximo. Nenhum agente herda o
histórico dos anteriores — o handoff é a única ponte.

O número da fase **é** o número da etapa: 9 fases, 9 agentes, 1 a 9.

### Artefatos

Em `docs/build-log/`, versionado junto com o código:

- **`STATE.md`** — arquivo vivo, primeira leitura obrigatória de todo agente. Fase atual,
  o que já existe, decisões acumuladas, pendências abertas, como subir o ambiente.
- **`NN-<fase>.md`** — handoff imutável de cada fase concluída.

### Contrato de cada agente

1. Ler `docs/build-log/STATE.md` e **apenas a seção da sua fase** neste plano.
2. Executar a fase. Não avançar para a próxima, mesmo que pareça trivial.
3. Escrever `docs/build-log/NN-<fase>.md` e atualizar `STATE.md`.
4. Parar. Se esbarrar em algo que exige decisão humana, escrever a pergunta no handoff
   em vez de escolher sozinho.

**Quem valida é o usuário.** O agente não roda `bun install`, `backend`, `dev`, `migrate`
nem build nativo — deixa no handoff a lista exata de comandos, em ordem, com o resultado
esperado de cada um.

### Conteúdo obrigatório do handoff

Curto e factual, nesta ordem: **Objetivo** (1 linha) · **Feito** (arquivos com caminho) ·
**Decisões** (só o que não é óbvio lendo o código) · **Comandos pro usuário rodar**
(em ordem, com o resultado esperado) · **Não feito** (e por quê) · **Contrato pro
próximo** (tabelas, helpers, rotas e tipos que a fase seguinte vai consumir).

### Sequência

| Fase | Escopo | Pré-requisito humano |
|---|---|---|
| 1 | Repositório | — |
| 2 | Limpar demo + `id.ts` | — |
| 3 | Schema + migrations | — |
| 4 | Camada Zero | — |
| 5 | Mídia R2 | **Conta Cloudflare R2 + credenciais no `.env.local`** |
| 6 | Feed UI | — |
| 7 | Cursos UI | — |
| 8 | Admin | — |
| 9 | Billing (adapter + provider `manual`) | — |

As fases 4 e 6 são as mais pesadas. Se a 4 ficar grande demais para um agente, o corte
natural é *models + relationships* primeiro e *queries + permissions* depois, com um
handoff entre as duas metades.

---

## Fase 1 — Repositório

**Sem monorepo.** O Takeout v2 é single-package por design e já contém o backend
(`app/api/`, `src/features/auth/server/`, `src/data/server/`, permissions `serverWhere`
que só rodam no servidor, Drizzle + migrations). Repo único não significa processo
único: em produção rodam três serviços independentes — app One, zero-cache e Postgres.

Separar o backend num serviço próprio **quebraria o Zero**: `docs/zero.md` exige que as
mutations rodem com o mesmo código no cliente (otimista) e no servidor (autoritativo).
Um backend HTTP à parte custaria sync reativo, cache local, updates otimistas e offline
— ou seja, trocaria de arquitetura, não só de pastas.

Workspaces só quando existir um segundo package real. Converter depois é `git mv` + um
`package.json` na raiz, e o risco chato (hoisting de `node_modules` quebrando React
Native) é o mesmo pago hoje ou depois — não há vantagem em antecipar.

**Estado atual (já resolvido em 25/08/2026, antes do plano começar):**
- ✅ `git init` + commit baseline feitos na raiz. Eram obrigatórios: `src/database/vite.config.ts:14`
  roda `execSync('git rev-parse HEAD')` ao carregar a config, então sem repo git o
  `bun backend` morria no passo `vite build` do `migrate:build`.
- ✅ Docker Desktop: a lista `IntegratedWslDistros` apontava pra uma distro `Ubuntu`
  inexistente; a real é `Ubuntu-22.04`. Integração WSL religada.
- ✅ `bun backend` sobe os 3 serviços (pgdb :5533 healthy, migrate exit 0, zero :4948).
- ✅ `bun dev` abre no web.
- ⚠️ Ambiente é WSL Ubuntu-22.04 sobre `/mnt/f/` (disco Windows). O bind mount do
  compose (`.:/app`) faz o `wsl` lançado da pasta do projeto cair em
  `/mnt/wsl/docker-desktop-bind-mounts/...`. Usar `wsl --cd /mnt/f/apps/bubble-app`.
- 📌 O README diz que o Postgres fica na porta 5444 — está errado. É **5533**
  (`docker-compose.yml:12` e `.env.development`).

Passos restantes:

1. `docker compose down` **antes** de mover — o nome do projeto Compose vem do nome da
   pasta, então os containers `mobile-bubble-app-*` viram órfãos depois da mudança.
2. `git mv` do conteúdo de `mobile-bubble-app/` para a raiz `F:\apps\bubble-app\`
   (o `.git` já está na raiz), incluindo os dotfiles. Remover a pasta vazia.
3. Renomear `name` de `my-bubble-app` para `bubble-app` no `package.json`; ajustar
   `app.config.ts` (nome exibido, slug, bundle id iOS / package Android).
4. Commit — baseline pro `bun tko up` (sync com upstream do Takeout, rastreado em
   `.takeout`).
5. Criar `docs/build-log/` com o `STATE.md` inicial e **copiar este plano** para
   `docs/build-log/PLAN.md`. Esta fase inaugura a estrutura de handoff descrita em
   "Modelo de execução" — o plano precisa viver dentro do repo, porque os agentes
   seguintes não têm acesso a esta conversa, só aos arquivos.

---

## Fase 2 — Limpar o demo

O vertical de _todo_ espalha por 17 arquivos — mais do que o óbvio. Lista real,
levantada por `grep -rni todo src app`:

**Apagar**
- `src/features/todo/` (`index.ts`, `useTodos.ts`)
- `src/data/models/todo.ts`
- `src/data/queries/todo.ts`

**Editar**
- `src/database/schema-public.ts` — remover a tabela `todo` e seu índice
- `src/database/relations.ts` — remover o bloco `todo` e a relação `todos` em `userPublic`
- `src/data/relationships.ts` — remover `todoRelationships`, a relação `todos` e a
  entrada em `allRelationships`
- `src/data/types.ts` — remover o import de `Todo`, o campo `todos` de
  `UserWithRelations` e o tipo `TodoWithUser`
- `src/data/server/actions/userActions.ts` — remover o import de `todo` e o
  `db.delete(todo)` dentro de `deleteAccount()`
- `app/(app)/home/(tabs)/feed/index.tsx` — substituir a demo por um placeholder de feed
  (e remover o banner amarelo de aviso do starter)
- `src/helpers/crypto/polyfill.native.ts` — endurecer o guard (ver abaixo)

**Criar**
- `src/helpers/id.ts`

**Não tocar**
- `src/database/migrations/*` — migrations são histórico. A remoção da tabela sai numa
  migration **nova**, gerada na Fase 3 pelo `bun migrate`.
- `src/data/generated/*` — é codegen. Regenerar com `bun zero:generate`, nunca editar
  à mão.

**Antes de apagar:** copiar `src/data/models/todo.ts` e `src/data/queries/todo.ts`
inteiros para dentro do handoff da fase. São o único exemplo funcional de
model + permission + mutation + query no repo, e as fases 3–5 vão precisar dele como
referência depois que o original sumir.

`app/(app)/home/settings/blocked-users.tsx` é um stub sem tabela por trás; fica pra
uma fatia de moderação futura.

### Criar `src/helpers/id.ts` junto com a limpeza

O demo quebra em `src/features/todo/useTodos.ts:36` com
`crypto.randomUUID is not a function`. Não é bug do todo — é uma armadilha que volta em
**todo insert do app**, porque `docs/zero.md` (seção "convergence") exige que o **cliente**
gere o `id`; id gerado no servidor quebra a convergência client/server das mutations.

O polyfill web (`src/helpers/crypto/polyfill.ts`) é um no-op deliberado, e
`crypto.randomUUID` só existe em **secure context** — https ou localhost. Testar no
celular pela rede (`http://192.168.x.x:8081`) **não é** secure context, então a API
simplesmente não existe lá. O polyfill native (`polyfill.native.ts`) só age
`if (typeof crypto === 'undefined')` — não cobre o Hermes, que define um `crypto`
parcial **sem** `randomUUID`.

Então: um helper único, usado por todas as mutations, em vez de chamar
`crypto.randomUUID()` direto:

```ts
// src/helpers/id.ts
import { randomUUID } from 'expo-crypto' // já está nas deps, tem impl web + native
export const newId = () => randomUUID()
```

E endurecer o guard de `polyfill.native.ts` para checar a função, não o objeto:
`typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function'`.

---

## Fase 3 — Modelo de dados

Tudo em `src/database/schema-public.ts` (exposto ao Zero), exceto `payment` que vai em
`schema-private.ts`. Depois: `bun migrate`.

**Conteúdo**
- `post` — `id, feedOwnerId, kind('text'|'photo'|'video'|'audio'), title?, body?,
  visibility('public'|'subscribers'), requiredPlanId?, published, publishedAt,
  likeCount, commentCount, deleted, createdAt`
- `media` — `id, ownerId, provider('r2'), storageKey, posterKey?, mime, kind, sizeBytes,
  durationSec?, width?, height?, status('pending'|'ready'|'failed'), createdAt`
- `postMedia` — `id, postId, mediaId, position` (post carrossel/multi-mídia)
- `comment` — `id, postId, userId, parentId?, body, deleted, createdAt`
- `reaction` — `id, postId, userId, type, createdAt` + índice único `(postId, userId, type)`

**Cursos**
- `course` — `id, feedOwnerId, slug, title, description, coverMediaId?, visibility,
  requiredPlanId?, published, order, createdAt`
- `courseModule` — `id, courseId, title, order`
- `lesson` — `id, courseId, moduleId?, title, body?, mediaId?, durationSec?, order,
  published, freePreview(boolean), createdAt`
- `lessonProgress` — `id, userId, lessonId, positionSec, completedAt?, updatedAt`

**Assinatura**
- `plan` — `id, slug, name, priceCents, currency('BRL'), interval('month'|'year'),
  active, order`
- `subscription` — `id, userId, creatorId, planId, provider('manual'|'stripe'|'asaas'|…),
  providerSubscriptionId?, status('trialing'|'active'|'past_due'|'canceled'|'expired'),
  currentPeriodEnd, cancelAtPeriodEnd, createdAt, updatedAt`
- `payment` (**privada**, só admin via server action) — `id, userId, subscriptionId,
  provider, providerPaymentId, amountCents, currency, status, paidAt`

### `feedOwnerId` / `creatorId` não são supérfluos

São a **chave de junção que torna o paywall possível no Zero** (ver Fase 4) — sem eles
não existe relacionamento `post → subscription`. Bônus: deixam a porta aberta pra mais
de um criador sem migration destrutiva. Valor = id do usuário mestre, vindo de uma
constante em `src/server/constants-server.ts`.

---

## Fase 4 — Camada Zero (models, relationships, queries, permissions)

Um arquivo por tabela em `src/data/models/`, seguindo o exemplo do `todo` preservado no
handoff da Fase 2: `table().columns().primaryKey()` + `serverWhere` + `mutations()`.
Depois: `bun zero:generate`.

Relacionamentos em `src/data/relationships.ts` — além dos óbvios (`post.user`,
`post.comments`, `post.media`, `course.modules`, `lesson.progress`), o que destrava o gate:

```ts
// post → subscription, via o criador do feed
subscriptions: many({
  sourceField: ['feedOwnerId'],
  destSchema: tables.subscription,
  destField: ['creatorId'],
})
```

### O gate de acesso (peça central)

**Por que não no JWT:** `src/features/auth/server/authServer.ts:50` configura o JWT com
`expirationTime: '3y'` — o Takeout faz isso de propósito pra não ter que renovar token
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
- A sintaxe exata de `q.or` / `q.exists` / operador `IN` precisa ser confirmada contra
  `bun tko docs list` na hora de escrever — `docs/zero.md` mostra `exists` e `not`, mas
  não `or`.

Mesma permission (adaptada) para `course`, `lesson` (com bypass em `freePreview`) e
`media`. `lessonProgress`, `comment` e `reaction` seguem o padrão do `todo`:
`q.cmp('userId', auth.id)` para escrita.

Queries em `src/data/queries/` já com `.related()` completo — `docs/zero.md` é explícito:
query de índice deve carregar tudo que a tela de detalhe precisa, pro cache local
resolver a navegação instantaneamente.

---

## Fase 5 — Mídia (R2)

O Takeout Free não tem nada disso; é construção do zero.

1. Declarar as env vars no bloco `"env"` do `package.json` (o sistema de env do Takeout
   é code-driven, ver `scripts/helpers/env-load.ts`): `CLOUDFLARE_R2_ENDPOINT`,
   `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY`.
   Valores reais em `.env.local` (gitignored).
2. `src/server/storage/r2.ts` — cliente S3-compatível + `getSignedUploadUrl()` /
   `getSignedPlaybackUrl(key, ttl)`.
3. `app/api/media/upload-url+api.ts` — POST. Exige admin (`ensureAdmin` de
   `src/server/getIsAdmin.ts`, já existe). Cria `media` com `status: 'pending'`, devolve
   PUT assinado. Cliente sobe direto pro R2, depois marca `status: 'ready'`.
4. `app/api/media/[id]/play+api.ts` — GET. **É aqui que o paywall vale de verdade:**
   lê a `subscription` do usuário **direto do Postgres** (leitura fresca, sem cache de
   token), e só então responde 302 pra URL assinada com TTL curto (~5 min). Sem
   assinatura ativa → 403.
5. `src/features/media/` — hook de upload com progresso, `<MediaView>` que resolve
   foto/vídeo/áudio, player.

**Divisão de responsabilidade:** Zero/permissions escondem os **metadados**; a rota de
playback protege os **bytes**. As duas camadas são independentes de propósito.

**Limitação aceita:** MP4 único, sem HLS. Vídeo de curso longo em conexão ruim vai
sofrer. `media.provider` existe justamente pra permitir migrar pra Cloudflare Stream/Mux
depois sem mexer no schema.

---

## Fase 6 — Feed

`app/(app)/home/(tabs)/feed/` — lista (`index.tsx`), detalhe (`[postId].tsx`).
Componentes em `src/features/feed/`: `PostCard`, `PostMediaCarousel`, `CommentList`,
`LikeButton`. Reaproveitar `src/interface/` (Button, Input, PageContainer, headings,
avatars, Toast, Dialog) em vez de importar Tamagui direto — regra do próprio README.

`useAuth()` (não `useUser()`) para pegar `id`/`role` sem waterfall — anti-pattern
documentado em `docs/zero.md`.

---

## Fase 7 — Cursos

Nova aba no tab bar (`app/(app)/home/(tabs)/_layout.tsx` + `.native.tsx`).
Rotas: lista de cursos → `[courseSlug]` (currículo por módulo) → `[lessonId]` (player +
`lessonProgress` gravado com debounce). Feature em `src/features/courses/`.

---

## Fase 8 — Admin (web-only, mesmo projeto)

`app/(app)/admin/` com layout que redireciona quem não é admin — a checagem já existe
(`src/server/getIsAdmin.ts` + `role` em `AuthData`). Padrão de guard: o de
`app/(app)/_layout.tsx`. Telas: composer de post (upload + agendamento), CRUD de
cursos/aulas, lista de usuários (banir/promover via plugin `admin` do Better Auth),
assinaturas, e faturamento lendo `payment` por **server action** (`src/data/server/actions/`),
já que `payment` é tabela privada e não passa pelo Zero.

Web-only por escolha: não vale carregar o admin no bundle nativo. Se um dia crescer a
ponto de justificar deploy próprio, é aí que o repo vira workspaces e o admin sai como
`apps/admin` — não antes.

---

## Fase 9 — Billing (adapter agnóstico)

`src/features/billing/`:
- `types.ts` — interface `BillingProvider`: `createCheckout()`, `cancel()`,
  `parseWebhook()`.
- `providers/manual.ts` — admin concede/revoga assinatura na mão. **É o suficiente pro
  MVP** e destrava testar o paywall inteiro sem gateway.
- `app/api/billing/webhook/[provider]+api.ts` — valida HMAC, normaliza evento, atualiza
  `subscription` + insere `payment`.
- `app/api/billing/checkout+api.ts` — delega ao adapter ativo.

Quando escolher Stripe/Asaas/Pagar.me, escreve-se só um `providers/<nome>.ts`. Sem
migration, sem mexer em permission.

---

## Riscos a validar cedo

1. **Build nativo nunca foi validado** — só o web subiu até agora. Validar no celular
   antes de investir em feature: é o risco de maior custo se descoberto tarde, ainda
   mais com o projeto em `/mnt/f/` (disco Windows visto do WSL, onde file watching e
   symlink são o ponto fraco conhecido).
2. **`bun tko up`** (sync com upstream do Takeout) vira mais difícil depois que o
   `todo` for removido e a estrutura mudar. Commitar o baseline antes de tudo.
3. **Takeout Free é v2-beta**, com aviso explícito de "APIs may change" e Tamagui em
   `2.0.0-rc`. Fixar versões e atualizar em janelas conscientes (`upgradeSets` no
   package.json existe pra isso).
4. **Sintaxe de permission do Zero** (`or`/`IN`) — confirmar em `bun tko docs list`
   antes de escrever o gate.
5. **JWT de 3 anos** também congela `role`: promover alguém a admin não tem efeito até
   o token renovar. Vale checar se o plugin `admin` do Better Auth contorna isso, ou
   fazer a checagem de admin no servidor a partir do banco.

---

## Verificação

Por fase, não só no fim. **Quem roda é o usuário** — o agente entrega os comandos no
handoff.

- **Fase 1:** `bun install` → `bun backend` → `bun dev` (web em :8081) → `bun check`
  limpo. Abrir também no celular.
- **Fase 2:** `bun zero:generate` sem erro + `bun check` limpo. O app sobe com o feed
  vazio, sem erro de `crypto.randomUUID`.
- **Fase 3:** `bun migrate` aplica; conferir tabelas via `psql` no postgres :5533.
- **Fase 4:** `bun zero:generate` + `bun check`. Teste manual do gate: dois usuários
  (um com `subscription.status='active'`, outro sem) — o segundo **não pode receber a
  linha**, verificado no payload de sync (`?debug=2` na URL), não só na tela.
- **Fase 5:** upload de foto/vídeo/áudio ponta a ponta; e um `curl` na rota de playback
  com sessão sem assinatura tem que dar **403** — é o teste que prova o paywall.
- **Fases 6–8:** `bun test:unit` (Vitest) para queries/mutations;
  `bun test:integration` (Playwright) para os fluxos de login → feed → curso → admin.
- **Final:** `bun ci --dry-run` (pipeline completo sem deploy).
