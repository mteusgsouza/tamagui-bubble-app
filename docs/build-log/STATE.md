# STATE — Bubble App

> Arquivo vivo. **Primeira leitura obrigatória de todo agente.**
> Mapa completo em [`INDEX.md`](./INDEX.md). Contexto comum em
> [`plan/00-contexto.md`](./plan/00-contexto.md). Depois leia **só** `plan/NN-<sua-fase>.md`.

## Onde estamos

| | |
|---|---|
| Última fase concluída | **Fase 7 — Cursos UI** (código pronto; falta o usuário validar) |
| Próxima fase | **Fase 8 — Admin** |
| Fase 1 (Repositório) | ⏭️ **pulada por decisão do usuário** — ver "Pendências" |

Estado real da Fase 5:

- ✅ 3 rotas (`upload-url`, `complete`, `[id]/play`), cliente R2 com SigV4 escrito à mão,
  `<MediaView>` web + nativo, hook de upload com progresso
- ✅ `bun install` feito (`expo-video`, `expo-audio`) e **typecheck limpo, zero erros**,
  incluindo o player nativo contra as APIs reais
- ✅ `.env.local` criado com as quatro chaves do R2 preenchidas
- ✅ **validado em runtime pelo usuário (2026-08-29).** Upload ponta a ponta funcionou
  (foto de 30 KB → R2, `status: 'ready'`) e o **teste do tier passou nos três estados**,
  com a mídia presa a `p-cac` (que exige `plan-anual`) e a cobaia `test-user-b`:

  | Estado da cobaia | `GET /api/media/<id>/play` |
  |---|---|
  | sem assinatura | **403** `needs-subscription` |
  | Mensal ativo (plano **errado**) | **403** `needs-plan` |
  | Anual ativo | **302** para a URL assinada do R2 |

  A linha do meio é a prova da fase: `canAccessMedia` (gate do Zero) teria entregado o
  `storageKey` a esse usuário; a rota de playback barrou os bytes.
- ℹ️ **sem migration e sem tabela nova.** O replica do zero-cache **não** precisa ser
  reconstruído nesta fase

Estado real da Fase 7:

- ✅ lista de cursos com filtros, currículo por módulo, player de aula com retomada e
  conclusão automática, aba nova no tab bar (web + nativo)
- ✅ o `<MediaView>` passou a expor `onProgress` / `startAtSec` / `onEnded` — a aula usa,
  o feed não passa nada e não mudou
- ✅ `scripts/seed-courses.ts` cria 2 planos, 1 curso, 2 módulos e 5 aulas
  (idempotente) — **resolve em parte a pendência do seed**; posts continuam de fora
- ✅ typecheck limpo; 22 testes de unidade novos (50 no total)
- ⏳ **nada rodado em runtime.** Roteiro em [`handoffs/07-cursos.md`](./handoffs/07-cursos.md)
- ⚠️ **o throttle do progresso não é estético.** `ZERO_PER_USER_MUTATION_LIMIT_MAX` é 30
  mutations/minuto e a web dispara `timeupdate` ~4x/s: sem throttle, 8 segundos de vídeo
  estouram a cota. `useLessonProgress` grava no máximo 1x a cada 10 s.

Estado real da Fase 6:

- ✅ detalhe do post (`feed/[postId].tsx`), carrossel com "1/3", curtir, comentar,
  responder, apagar comentário e paginação por botão
- ✅ typecheck limpo, zero erros
- ✅ testes escritos: 2 de unidade (funções puras) + 1 de integração (Playwright)
- ⏳ **nada rodado**: `bun test:unit` não roda do Windows (binários de `rolldown` são de
  Linux) e nada foi validado em runtime. Roteiro em
  [`handoffs/06-feed.md`](./handoffs/06-feed.md)
- ⚠️ **o seed tem `commentCount` mentindo**: `p-landing` diz 3, `p-funil` 2, `p-anuncio`
  1, e a tabela `comment` está **vazia**. Zere antes de testar comentário:
  `UPDATE post SET "commentCount" = 0`
- ℹ️ a rampa de acento (`src/tamagui/brandAccent.ts`) e o mock em `docs/design/` já
  existiam antes desta fase, feitos fora do fluxo de agentes

Estado real da Fase 4:

- ✅ `bun zero:generate` — 13 models, 12 queries, 44 mutations
- ✅ `bun check types` — limpo
- ✅ migration da Fase 3 aplicada: 20 tabelas, 13 na publication, **`payment` fora dela**
- ✅ `VITE_MASTER_USER_ID="demo-user-id"` (usuário semeado por
  `migrations/20260204022039_demo_user.ts`; senha `demopassword123`)
- ⚠️ **os posts de teste da Fase 4 (`post-aberto`, `post-assinante`, `post-anual`,
  `post-rascunho`) NÃO existem mais** — o banco foi resemeado com conteúdo realista.
  Seed atual (conferido em 2026-08-29): `p-anuncio` (video, subscribers) · `p-cac`
  (text, **exige `plan-anual`**) · `p-funil` (photo, subscribers) · `p-landing` e
  `p-preco` (public). Planos `plan-mensal`/`plan-anual` continuam. Nenhuma assinatura
  ativa. **Confira com `SELECT id, kind, visibility, "requiredPlanId" FROM post` antes de
  copiar id de qualquer roteiro.**
- ✅ **teste do gate em runtime: PASSOU.** Verificado no servidor, lendo
  `"zero_0/cvr".rows` no banco `zero_cvr` — que é onde dá para ver o que o zero-cache
  realmente entregou a cada cliente, sem depender de UI:

  | Estado da cobaia | Posts com `refCounts` preenchido |
  |---|---|
  | sem assinatura | `post-aberto` |
  | Mensal ativo | `+ post-assinante` · **`post-anual` barrado** |
  | Anual ativo | `+ post-anual` |
  | cancelada | volta a só `post-aberto` |

  A linha do Mensal é a prova do join de duas colunas respeitando `requiredPlanId`.
  ⚠️ **Ao ler a CVR, olhe `refCounts`, não a presença da linha:** a linha vira lápide
  (com `patchVersion` novo) e continua na tabela depois de revogada. `refCounts` vazio
  = fora da visão do cliente.

## Ambiente

- Projeto em `F:\apps\bubble-app\mobile-bubble-app\`, rodado do **WSL Ubuntu-22.04**
  em `/mnt/f/apps/bubble-app/mobile-bubble-app`.
- Abrir o WSL com `wsl --cd /mnt/f/apps/bubble-app` — lançar da pasta do projeto cai
  no bind mount do Docker (`/mnt/wsl/docker-desktop-bind-mounts/...`).
- Subir o backend: `bun backend` → pgdb **:5533**, zero-cache **:4948**, migrate (sai 0).
  `bun backend` roda `migrate:build` antes, então gera migration nova se o schema mudou.
- Subir o app: `bun dev` → web em **:8081**.
- ⚠️ O README diz Postgres na porta 5444. **Está errado, é 5533** (`docker-compose.yml:12`).
- ⚠️ `src/database/vite.config.ts:14` roda `execSync('git rev-parse HEAD')` ao carregar
  a config. Sem repo git **com pelo menos um commit**, `bun backend` morre no
  `migrate:build`. O repo já existe em `F:\apps\bubble-app\`.
- ⚠️ **Mudou o conjunto de tabelas publicadas? O replica do zero-cache tem que ser
  reconstruído.** Senão ele morre com `Unknown table <nome>` no primeiro INSERT na
  tabela nova: o replica (SQLite, no volume `mobile-bubble-app_zero_data`) foi criado a
  partir da publication antiga e não reconhece a tabela que chega pelo WAL.
  Aconteceu na Fase 4.
  - **Descartável** (banco sem nada que importe): `bun backend:clean && bun backend` —
    apaga os dois volumes, inclusive o Postgres. As migrations recriam o usuário demo.
  - **Preservando o Postgres:** `docker compose down` →
    `docker volume rm mobile-bubble-app_zero_data` → subir só o pgdb →
    dropar/recriar `zero_cvr` e `zero_cdb` → `pg_drop_replication_slot` nos slots
    `zero_%` → `bun backend`.
- `src/database/migrate.ts` usa `defaultTimeout: 30_000` (o runner vem com 5s). A
  migration da Fase 3 estoura 5s em banco recém-inicializado neste ambiente. Se uma
  migration futura for maior ainda, existe `export const timeout` por migration.
- 🔴 **O file watching NÃO funciona.** O projeto vive em `/mnt/f` (disco Windows visto
  da WSL) e nem o Vite nem o scanner de rotas do One percebem arquivo criado ou
  editado com o dev server no ar. Confirmado duas vezes na Fase 4: rota nova não entrou
  em `app/routes.d.ts`, e edição de rota existente continuou sendo servida com o
  conteúdo antigo (verificado buscando o módulo direto do dev server). **Toda edição
  exige reiniciar o `bun dev`**, e se persistir, apagar `node_modules/.vite`
  e `node_modules/.vite-temp`. Isso torna as Fases 6–8 (UI) muito mais lentas — vale
  considerar mover o repo para dentro do sistema de arquivos da WSL (`~/apps/...`),
  que é o que a Fase 1 já previa em outro contexto.
- ⚠️ **Abrir o app pelo IP de rede quebra o login.** `trustedOrigins` só confia em
  `localhost:8081`; pelo IP que o `bun dev` imprime como "Network" todo POST de auth
  volta 403 `INVALID_ORIGIN`. No desktop, use `http://localhost:8081`. Para celular
  físico, ver `plan/10-auth.md`.
- ⚠️ **`bun run:dev` já embute o `bun`** (`"run:dev": "bun env:dev bun"`). Então é
  `bun run:dev scripts/x.ts`, **sem** um segundo `bun`. Escrever
  `bun run:dev bun scripts/x.ts` vira `bun bun scripts/x.ts`, que aciona o bundler
  legado do Bun com target de browser e falha com
  `Browser build cannot require() Node.js builtin: "tls"`. O erro não tem nada a ver com
  o script.
- 🔴 **DEEP LINK NÃO FUNCIONA NA WEB — bug pré-existente, não resolvido.**
  Carregar direto qualquer URL abaixo do grupo de abas cai em `/home/feed`. Vale para
  rota do starter também (`/home/settings/edit-profile`), então **não veio das Fases
  5–7**. Navegação dentro do app funciona normal; só o carregamento direto quebra.
  Isso também impede compartilhar link de post ou de curso.

  Medido no navegador, com `history.pushState/replaceState` instrumentado:

  | pedido | chega em |
  |---|---|
  | `/home/courses/<slug>` | `/home/courses` ou `/home/feed` |
  | `/home/feed/<postId>` | `/home/feed` |
  | `/home/settings/edit-profile` | `/home/feed` |

  O passo revelador: o roteador reescreve para `/auth/login?courseSlug=<slug>` —
  **levando os params da rota original**. Isso é o react-navigation recaindo na primeira
  rota do grupo `(app)`, que é `auth` (vem antes de `home` na árvore). O gatilho é o
  `return null` de `app/(app)/_layout.tsx` enquanto `state === 'loading'`: devolver
  `null` desmonta o navegador filho.

  ⚠️ **Tentei remover esse `return null` e PIOROU** — o comportamento virou
  intermitente (às vezes chegava na rota certa, às vezes no feed). Revertido ao original.
  Quem for atacar isso precisa entender o linking do One primeiro; provavelmente a
  solução real é `defaultRenderMode` diferente de `'spa'` no `vite.config.ts`, ou um
  gate que não desmonte a árvore.

  Já descartados com evidência: bundle velho no navegador (recarga com cache-bust),
  registro de rota (a árvore do cliente tem as rotas certas), `index+ssg.tsx` (o módulo
  nunca é carregado na rede) e corrida do estado de auth (o rastro mostra `loading` nos
  dois renders, nunca `logged-out`).
- ✅ **Corrigido no caminho:** `ONE_SUSPEND_ROUTES=1` estava no `.env.development` e o
  One deixa isso **off por padrão na web** ("suspense causes flickers on web during nav
  since react navigation doesn't properly respect startTransition"). Com ele ligado, o
  trajeto ganhava um passo a mais por `/`. Desligado.
- ✅ **Corrigido no caminho:** `process.env.VITE_PLATFORM` é usada em 4 layouts para
  escolher `<Slot>` (web) vs `<Stack>` (nativo) e **nunca é definida** — nem pelo
  projeto, nem pelo One/vxrn. Na web os quatro caíam no ramo nativo. Trocado por `isWeb`
  do Tamagui. (Bug real e separado; **não** era a causa do deep link.)
- ⚠️ **Query nova exige `bun zero:generate`.** As synced queries são registradas em
  `src/data/generated/syncedQueries.ts`; sem regenerar, a query nem existe para o
  servidor e a tela fica vazia sem erro óbvio. Aconteceu com a `courseBySlug` da Fase 7.
- ℹ️ **Dá para reiniciar o dev server sem o usuário**, do Windows:
  `wsl.exe -d Ubuntu-22.04 -- bash -lc "cd /mnt/f/apps/bubble-app/mobile-bubble-app && exec /home/mateus/.bun/bin/bun dev"`
  em background. O `bun` **não** está no PATH de shell não-interativo — use o caminho
  completo. Matar: `ss -ltnp | grep :8081` para achar o pid.
- Typecheck é **`bun check types`**. `bun check` sozinho só lista os sub-scripts do
  `tko` (`lint`, `types`) e não roda nada.
- ⚠️ **`bun check lint` / `bun lint:fix` quebram** com `panic: unknown rule:
  no-unnecessary-type-conversion`. É descasamento de versão do starter:
  `.oxlintrc.json:64` liga uma regra que o `oxlint-tsgolint` 0.11.5 instalado não
  conhece. Não tem a ver com o código do app. Saídas: apagar aquela linha do
  `.oxlintrc.json`, ou subir o `oxlint-tsgolint`. **Ainda não decidido.**
  Efeito colateral: o `bun zero:generate` sai com código 1 mesmo tendo gerado tudo —
  o `--after 'bun lint:fix'` é que falha, e o `oxfmt` roda antes, então a formatação
  é aplicada.
- ⚠️ Os binários nativos de `oxfmt`/`oxlint` instalados são de Linux (install feito do
  WSL). Formatar/lintar **só funciona de dentro do WSL**, não do PowerShell/Git Bash.
- Validação é feita **pelo usuário**, em web + celular físico. Nenhum agente roda
  `install`, `backend`, `dev`, `migrate` ou build nativo.
- ℹ️ **Dá para rodar o typecheck do Windows**, sem WSL e sem bun:
  `node ./node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`. É o `tsc` normal
  (o `bun check types` usa tsgo, mais rápido), mas roda e é a única checagem que um agente
  consegue fazer sozinho neste ambiente. Levou ~2 min na Fase 5.
- ⚠️ **Onde ficam as credenciais.** `.env.local` é gitignored **e é lido pelo `bun dev`**
  (o `loadEnv` do vxrn lê `.env`, `.env.local`, `.env.development`,
  `.env.development.local`, nessa ordem — o último vence). Os scripts com dotenvx
  (`migrate`, `run:dev`, `test`) rodam `-f .env .env.development` e **não** leem
  `.env.local`. `.env.development` **não** é gitignored: segredo nenhum ali.

## Decisões acumuladas

1. **Repo único, sem monorepo.** O backend é `app/api/` + `src/data/server/` + Zero.
   Separar num serviço próprio quebraria a convergência client/server das mutations.
2. **Ids são gerados no cliente**, sempre via `newId()` de `src/helpers/id.ts`.
   Nunca `crypto.randomUUID()` direto, nunca id gerado dentro da mutation.
3. **Gate de assinatura é join server-side**, não claim de JWT — o token do Takeout dura
   3 anos (`src/features/auth/server/authServer.ts:50`).
4. **Pagamento abstraído** (`plan`/`subscription` agnósticos + adapter). Gateway real
   ainda não escolhido; o MVP usa concessão manual pelo admin.
5. **Vídeo em R2 direto**, sem transcoding/HLS. `media.provider` existe pra migrar depois.
6. **Enums são colunas `text`**, nunca `pgEnum` — `text('kind', { enum: [...] })` no
   Drizzle, `enumeration<...>()` no Zero. Evita `ALTER TYPE` e mapeamento incerto na
   replicação.
7. **FKs de conteúdo apontam pra `userPublic`**, não pra `user`. `user` é privada e não
   é replicada: uma FK pra ela seria invisível no cliente. Só `payment` referencia `user`.
8. **Defaults fecham, não abrem**: `visibility='subscribers'`, `published=false`.
   Conteúdo esquecido no default fica trancado.
9. **Permission de leitura ≠ permission de escrita.** `mutations()` recebe a de
   escrita; a de leitura vive em `src/data/where/canAccessContent.ts` e é aplicada nas
   queries com `.where(...)`. Admin não é checado em permission nenhuma — o
   `defaultAllowAdminRole: 'all'` de `src/zero/server.ts` já cobre.
10. **`requiredPlanId` é respeitado por join de duas colunas**
   (`['feedOwnerId','requiredPlanId'] → ['creatorId','planId']`), porque permission do
   Zero não compara coluna com coluna. Vale para `post` e `course`.
11. **Cor primária é token, definido ANTES do primeiro componente.** O Tamagui v5 já
   expõe `$accentBackground`, `$accentColor` e `$accent1`–`$accent12` (hoje em escala de
   cinza, default do Takeout). A Fase 6 sobrescreve essa rampa uma vez em
   `src/tamagui/tamagui.config.ts` e daí todo componente de `src/features/` e
   `src/interface/` referencia `$accent*`. **Hex de acento dentro de componente é bug.**
   Cores semânticas (sucesso, erro, aviso) são independentes e não seguem o acento.
   *Motivo:* o mock de design nasceu com o âmbar repetido em ~80 pontos e trocar a cor
   depois não funcionou direito. Decisão do usuário: token primeiro, componente depois.
12. **Bytes de mídia nunca passam pelo servidor do app.** Upload é PUT direto no R2 com
   URL assinada; leitura é 302 para URL assinada. O servidor só assina e decide.
   Corolário: **a tela nunca monta URL de R2** — o `storageKey` que chega pelo sync não
   abre arquivo nenhum. Tudo passa por `<MediaView>` ou `/api/media/[id]/play`.
13. **TTL da URL assinada de vídeo/áudio é longo (4 h), não curto.** O player revalida a
   assinatura a cada `Range`, e renovar por timer trocaria o `src` e reiniciaria a
   reprodução. Renovação acontece no `onError`, não no relógio. Foto e poster ficam em
   5 min. Ver decisão 6 do [handoff 05](./handoffs/05-midia-r2.md).

## Pendências abertas

- **`VITE_MASTER_USER_ID` está vazio.** A constante existe
  (`src/constants/creator.ts`), mas o id do criador é escolha humana: rodar o `psql` do
  [handoff 04](./handoffs/04-camada-zero.md) e preencher `.env.development`. Com ele
  vazio, o feed abre vazio — é o comportamento correto, não bug.
- **Não existe cadastro pela UI.** O Takeout Free nunca chama `authClient.signUp.email`
  fora do botão de demo: a rota `/auth/signup/email` só coleta o e-mail e manda para a
  tela de senha, que chama `passwordLogin` → `signIn.email`. Com e-mail novo dá
  `INVALID_EMAIL_OR_PASSWORD`. O servidor **já suporta** cadastro
  (`app/api/auth/...`, e `src/features/auth/server/apiHandler.ts` intercepta o 422 de
  e-mail existente e cai para sign-in) — falta o cliente chamar. O conserto é espelhar
  `signInAsDemo.ts` dentro de `passwordLogin`. **Não feito: decisão pendente**, porque
  signUp-primeiro faz e-mail com typo virar conta nova. O certo mesmo é separar as telas
  de login e cadastro numa fase de auth.
- **Contas existentes hoje:** `demo@takeout.tamagui.dev` / `demopassword123`
  (id `demo-user-id`, é o criador) e `teste@bubble.local` / `teste123456`
  (id `test-user-b`, cobaia do teste de paywall, criada à mão no banco).
- **Seed: metade resolvida.** `scripts/seed-courses.ts` (Fase 7) recria planos, curso,
  módulos e aulas de forma idempotente. **Os 5 posts continuam sem script** — foram
  criados à mão e somem num `bun backend:clean`.
- **`exists` dentro de `exists` não foi validado em runtime** (`canAccessLesson`,
  `canAccessComment`). Se o zero-cache reclamar, o plano B é desnormalizar
  `feedOwnerId`/`visibility` na `lesson`.
- ~~**`canAccessMedia` ignora `requiredPlanId`** de propósito.~~ **Fechado na Fase 5:**
  `src/server/media/mediaAccess.ts` refaz o gate com o tier antes de assinar a URL do R2.
  Falta o usuário provar em runtime (roteiro no handoff 05).
- **Promover o criador a `role = 'admin'`?** O criador (`demo-user-id`) tem
  `role = 'user'`, então `canUploadMedia()` aceita `admin` **ou** `MASTER_USER_ID`. Um
  `UPDATE "user" SET role = 'admin'` no criador simplificaria isso e a Fase 8. Decisão
  humana, não tomei.
- **Conta Cloudflare R2 e `.env.local`** continuam pendentes — sem eles as rotas de mídia
  respondem 503 e o resto do app funciona normalmente.
- **Fase 1 (Repositório) não foi executada.** O app continua na subpasta
  `mobile-bubble-app/` e o `package.json` ainda se chama `my-bubble-app`. Nada depende
  disso para as fases seguintes, mas continua no plano.
- **Idioma da UI — ainda aberto, e agora meio a meio.** Tudo que as Fases 5 e 6
  escreveram (feed, detalhe, comentários, mensagens de mídia) é **português literal**;
  o que veio do Takeout (auth, settings) segue em inglês. Ninguém decidiu entre traduzir
  o resto ou adotar i18n. **Cada fase de UI encarece essa decisão** — decidir antes da
  Fase 7 é mais barato que depois.
- **Build nativo nunca validado.** Só o web subiu até hoje.
- ~~**Sintaxe de permission do Zero** (`q.or`, operador `IN`) não confirmada.~~
  **Resolvido na Fase 3:** o expression builder do `@rocicorp/zero` 0.26.2 tem
  `or`, `and`, `not`, `cmp`, `cmpLit` e `exists`, e os operadores `IN` / `NOT IN` são
  válidos (`zero-protocol/src/ast.d.ts:21`). `_.or` já é usado em
  `src/data/models/user.ts`.

## Handoffs

- [`handoffs/02-limpar-demo.md`](./handoffs/02-limpar-demo.md)
- [`handoffs/03-modelo-de-dados.md`](./handoffs/03-modelo-de-dados.md)
- [`handoffs/04-camada-zero.md`](./handoffs/04-camada-zero.md)
- [`handoffs/05-midia-r2.md`](./handoffs/05-midia-r2.md)
- [`handoffs/06-feed.md`](./handoffs/06-feed.md)
- [`handoffs/07-cursos.md`](./handoffs/07-cursos.md)
