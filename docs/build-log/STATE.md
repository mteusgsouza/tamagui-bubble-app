# STATE — Bubble App

> Arquivo vivo. **Primeira leitura obrigatória de todo agente.**
> Mapa completo em [`INDEX.md`](./INDEX.md). Contexto comum em
> [`plan/00-contexto.md`](./plan/00-contexto.md). Depois leia **só** `plan/NN-<sua-fase>.md`.

## Onde estamos

| | |
|---|---|
| Última fase concluída | **Fase 10 — Auth** (cadastro validado contra o servidor) |
| Próxima fase | — todas as fases planejadas foram executadas; ver "Pendências abertas" |
| Fase 1 (Repositório) | ⏭️ **pulada por decisão do usuário** — ver "Pendências" |

Estado real da Fase 10:

- ✅ **cadastro pela UI existe**: "Entrar com e-mail" e "Criar conta" são caminhos
  separados, o `intent` atravessa as telas, e o cadastro pede nome + senha
- ✅ **validado contra o servidor** com conta nova: as 4 linhas nascem
  (`user`, `userPublic`, `userState`, `account`), senha errada dá 401, e-mail repetido
  com senha certa cai para sign-in (200), senha curta dá `PASSWORD_TOO_SHORT`
- ✅ **elo com a Fase 9 fechado**: a conta criada assim recebeu assinatura pelo
  `/api/admin/people`. O hook `afterCreateUser` está em `databaseHooks.user.create.after`,
  então **vale também para o OAuth**
- ✅ `EXTRA_TRUSTED_ORIGINS` — origem extra por env, que é o que faz o app abrir no
  **celular físico** (pelo IP, todo login voltava 403 `INVALID_ORIGIN`)
- ⚠️ **Google OAuth está escrito mas nunca foi exercido.** Sem `GOOGLE_CLIENT_ID` e
  `GOOGLE_CLIENT_SECRET`, o provider não é registrado e o botão avisa em vez de quebrar.
  Ligar é preencher as duas chaves no `.env.local` — receita no
  [handoff 10](./handoffs/10-auth.md)
- ⚠️ **Sem recuperação de senha e sem verificação de e-mail.**
- ⏳ **O clique pelas telas precisa de um humano** — ver a armadilha do `document.hidden`
  logo abaixo. Roteiro no handoff 10

Estado real da Fase 9:

- ✅ adapter de cobrança (`src/features/billing/`), webhook com HMAC, rota de checkout,
  job de expiração e **CRUD de planos** (`/admin/plans`) — os planos só existiam por
  `INSERT` à mão até aqui
- ✅ typecheck limpo; **92 testes** (era 65)
- ✅ **validado**: `scripts/billing-smoke.ts` com 12 casos verdes (assinatura inválida
  401, provider inexistente 404, cron sem token 401, criação de assinatura por webhook,
  e **pagamento reenviado devolvendo `duplicate`**). Job de expiração provado no banco:
  `currentPeriodEnd` recuado 2 dias → `{"expired":1}` → `status = expired`
- ⚠️ **`BILLING_PROVIDER=manual`: não há gateway real.** `POST /api/billing/checkout`
  devolve **501 `no-gateway`** de propósito — o `createCheckout` do manual concede na
  hora, então expor a rota daria assinatura de graça a qualquer um logado
- ⚠️ **Ninguém agenda o cron.** `/api/cron/expire-subscriptions` existe e é protegida por
  `CRON_SECRET`, mas nada a chama sozinho. Sem um agendador em produção, assinatura
  vencida continua liberando conteúdo
- ⚠️ **Não existe tela de assinar.** `activePlans` não é renderizada em lugar nenhum do
  app — o assinante não tem onde clicar
- ✅ **o criador virou `role = 'admin'`** (era pendência aberta; ver "Decisões", 14)

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

Estado real da Fase 8:

- ✅ admin de conteúdo (posts com mídia, cursos com módulos/aulas) e de pessoas
  (usuários, assinaturas, faturamento)
- ✅ **validado no navegador**: criei um post pelo composer, publiquei, confirmei no
  Postgres (`published = t`, `publishedAt` preenchido) e apaguei
- ✅ typecheck limpo; **56 testes** passando
- ℹ️ **dois níveis de acesso**: `canManage` (admin **ou** criador) abre o admin de
  conteúdo; `canManagePeople` (só `role = 'admin'`) abre a aba Pessoas. O criador
  semeado tem `role = 'user'`, então a aba Pessoas não aparece para ele
- ℹ️ **as rotas de `/api/admin/` relêem a role do Postgres**, não do JWT — é o contorno
  do token de 3 anos que o plano avisava
- ⚠️ `admin` virou a **primeira rota do grupo `(app)`** em ordem alfabética, então o
  fallback do carregamento direto agora pisca em `/admin` antes do destino. O destino
  final não mudou (medido antes e depois)

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
- 🔴 **Nunca rode `bun backend` de dentro do bind mount.** O Compose deriva o **nome do
  projeto do diretório**, então lá ele monta uma stack **paralela** (`6e1d6912...`) com
  rede e volumes próprios — e morre com:

  ```
  Bind for 0.0.0.0:5533 failed: port is already allocated
  ```

  A porta já é da stack de verdade. O erro engana: parece conflito de porta, é diretório
  errado. Confira com `docker compose ls -a` — se aparecer um projeto com nome de hash,
  é isso. Limpeza (**só a stack de hash**, os volumes `mobile-bubble-app_*` são os seus):

  ```bash
  P=<hash>
  docker rm -f "$P-zero-1" "$P-migrate-1" "$P-pgdb-1"
  docker volume rm "${P}_pgdb_data" "${P}_zero_data"
  docker network rm "${P}_default"
  ```

  Depois suba do lugar certo: `cd /mnt/f/apps/bubble-app/mobile-bubble-app && bun backend`.
- ℹ️ `docker compose up -d` às vezes deixa o **zero de fora** quando o `migrate` acabou de
  rodar. Suba explicitamente: `docker compose up -d zero`.
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
- ✅ **Upload pelo navegador: RESOLVIDO e validado ponta a ponta (2026-08-31).**
  Estava bloqueado por CORS — o PUT assinado é cross-origin (app em `:8081`, bucket em
  `r2.cloudflarestorage.com`) e o preflight morria com
  `No 'Access-Control-Allow-Origin' header`.

  ⚠️ **Como isso escapou da verificação da Fase 5:** o `scripts/media-smoke.ts` sobe pelo
  **Node**, que não tem CORS. As imagens que já estavam no bucket vieram por ali. O
  caminho testado era incapaz de pegar o problema. **Lição: upload de navegador só se
  prova no navegador.**

  Conserto: `scripts/r2-cors.ts` aplica a política pela API S3 do R2 (SigV4 por
  cabeçalho, diferente do `r2.ts` que assina por query string e só serve para objeto).
  Exige token R2 com **Admin Read & Write** — token de objeto recebe `AccessDenied`.
  `--get` lê a política sem alterar nada.

  Validado: 3 fotos escolhidas de uma vez no composer → `status: 'ready'` com bytes
  reais no Postgres (o `complete` confere por HEAD no bucket) → `post.kind = photo`
  deduzido sozinho → post publicado aparece no feed com o carrossel e o indicador "1/3".

- 🔴 **Ferramenta automatizada não consegue clicar na UI animada — e a tela parece
  vazia.** O navegador de automação roda com `document.hidden === true`, e aí
  `requestAnimationFrame` **não dispara**. O Tamagui usa **duplo rAF** para remover o
  `enterStyle` (`@tamagui/web/src/createComponent.tsx`, "Animation enter state machine"),
  então todo componente com `enterStyle` fica parado em `opacity: 0` com a classe
  `t_unmounted` — na tela de login, isso é **todos os botões**.

  **Não é bug do app.** Antes de caçar fantasma numa tela "vazia", rode
  `document.hidden` no console. Telas sem `enterStyle` (todo o `/admin`) funcionam
  normalmente por ferramenta.

  Corolário: **fluxo de auth só se prova clicando de verdade**, como o upload de
  navegador da Fase 5. Roteiro no [handoff 10](./handoffs/10-auth.md).
- ✅ **DEEP LINK NA WEB: RESOLVIDO.** O sintoma era carregamento direto de URL terminando
  em outra rota — e, depois da Fase 8, terminando em `/admin`, inclusive logo após o
  login e no logout.

  **Causa:** o guard de `app/(app)/_layout.tsx` fazia `if (state === 'loading') return null`.
  Isso desmontava a árvore inteira — providers e roteador junto. Quando a sessão resolvia
  (~200ms depois do boot), tudo remontava e o roteador se reinicializava na **primeira
  rota do grupo em ordem alfabética**, que virou `/admin` quando a Fase 8 criou a pasta.

  **Medido**, instrumentando `history.pushState`/`replaceState` no navegador:

  | | antes | depois |
  |---|---|---|
  | `/home/feed` direto | `/home/feed` → **`/admin`** (1237ms) → `/home/feed` (1530ms) → `/auth/login` | `/home/feed` do começo ao fim |
  | estabilizou em | 1679ms | 573ms |

  **Conserto:** nunca devolver `null` do guard. Os providers ficam montados o tempo todo
  e só o conteúdo é trocado; o redirect passou a ser decidido depois que a sessão resolve.

  ⚠️ **Se voltar a acontecer, o alvo é a mesma classe de problema:** algo desmontando a
  árvore do roteador. E o destino do escorregão é sempre a primeira rota do grupo em
  ordem alfabética — hoje `/admin`.

  Verificado sem passar por `/admin`: `/home/feed` direto, `/home/courses` direto,
  `/home/settings` deslogado (→ `/auth/login`) e o login completo (→ `/home/feed`).

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
- 🔴 **`pkill -f "one dev"` NÃO mata o dev server.** O processo se renomeia para
  `Onejs:dev > /mnt/f/...`, então o padrão não casa. O que acontece é pior que nada: o
  `pkill` não mata, o novo `bun dev` morre porque a porta 8081 está ocupada, e **o
  servidor antigo continua servindo** — com o cache em memória de antes das suas
  edições. O sintoma engana: você edita, reinicia, e a tela não muda; limpa
  `node_modules/.vite`, reinicia, e continua não mudando.

  **Diagnóstico rápido:** o módulo pedido com query volta novo e sem query volta velho.

  ```bash
  curl -s "http://localhost:8081/src/features/app/MainHeader.tsx"        # velho
  curl -s "http://localhost:8081/src/features/app/MainHeader.tsx?t=1"    # novo
  ```

  **Matar de verdade:** `pkill -f "Onejs:dev"; pkill -f "bun dev"`, e conferir com
  `ps -eo pid,args | grep -i onejs` e `ss -ltn | grep 8081` antes de subir de novo.
  Ao subir depois de apagar `node_modules/.vxrn/compiler-cache`, o Vite reotimiza as
  dependências e recarrega **duas vezes** — espere ~60 s antes de olhar a tela.
- ℹ️ **Dá para reiniciar o dev server sem o usuário**, do Windows:
  `wsl.exe -d Ubuntu-22.04 -- bash -c "cd /mnt/f/apps/bubble-app/mobile-bubble-app && exec /home/mateus/.bun/bin/bun dev"`,
  **em tarefa de background que fica viva**. Três armadilhas juntas aqui:
  1. **`export PATH=$HOME/.bun/bin:$PATH` quebra**: o PATH do Windows entra na sessão WSL
     com espaços (`/mnt/c/Program Files/...`) e o `export` sem aspas vira erro de sintaxe,
     deixando o `bun` fora do PATH. Use o **caminho completo**, ou `PATH="..." bun ...`
     numa linha só, com aspas.
  2. **`setsid nohup ... &` não basta**: se nenhum outro processo estiver rodando na
     distro, a sessão do WSL encerra junto com o comando e leva o servidor. Manter a
     tarefa em background é o que segura a distro de pé.
  3. Matar: `pkill -f "Onejs:dev"` (ver acima), não `pkill -f "one dev"`.
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
- ⚠️ **Onde fica cada variável, e por que os arquivos pareciam arbitrários.**

  | arquivo | o que vai nele | versionado? |
  |---|---|---|
  | `.env` | igual em toda máquina e em produção (versão do Zero, tuning, `BILLING_PROVIDER`) | **não** — é gerado |
  | `.env.development` | configuração de dev **sem segredo real** (URLs, bancos locais, ids) | sim |
  | `.env.local` | segredo de verdade: R2, Google, chaves de API | **não** |

  O `.env` **não é versionado**: nasce no `postinstall` e é regravado por
  `bun env:update` a partir do bloco `env` do `package.json` — que é a fonte de verdade e
  também alimenta `src/server/env-server.ts` e `.github/workflows/ci.yml`. Só o miolo
  entre os marcadores `AUTO-GENERATED` é reescrito; comentário fora deles sobrevive.

  🔴 **Uma variável mora em UM arquivo só.** Não é preferência: os três carregadores
  discordam da ordem, então chave repetida resolve **diferente conforme o comando**.

  | carregador | ordem | quem vence |
  |---|---|---|
  | `bun <script>` | `.env` → `.env.development` → `.env.local` | `.env.local` |
  | `bun dev` (vxrn `loadEnv`) | `.env` → `.env.local` → `.env.development` → `.env.development.local` | `.env.development` |
  | `dotenvx` (`env:dev`) | só `.env` e `.env.development` | não sobrescreve o que o bun já pôs |

  ⚠️ **Correção de uma nota anterior deste arquivo:** dizia que os scripts com dotenvx
  "não leem `.env.local`". Eles leem — não pelo dotenvx, mas porque o **próprio `bun`
  carrega `.env`, `.env.development` e `.env.local` sozinho**, antes de qualquer coisa.
  Verificado rodando um script sem dotenvx nenhum: as chaves do R2 chegam igual.

  Mapa completo do que é opcional e onde preencher: `.env.local.example`.

## Produção

Três provedores, porque cada peça tem uma exigência diferente:

| peça | onde | por quê |
|---|---|---|
| app server + zero-cache | **AWS Lightsail** (`deploy/aws/`) | uma máquina, um Caddy, dois subdomínios |
| Postgres | **Neon** (`sa-east-1`) | free tier serve |
| mídia | **Cloudflare R2** | PUT direto do navegador, com CORS por origem |

- 🔴 **O Fly saiu.** O trial dura 7 dias e não deixa cadastrar domínio próprio — e sem
  domínio não existe login com Google. `deploy/fly-*.toml` ficam no repo como referência.

- 🔴 **A Vercel não serve para o app server.** As funções serverless que o One gera não
  levam `node_modules` — o builder copia só o `react`, e tudo externo estoura em runtime
  com `Cannot find package 'better-auth'`. Medido em produção: `/api/health` respondia
  200 (não importa nada) e toda rota com auth ou banco dava 500. E `@rocicorp/zero` e
  `on-zero` **precisam** ser externos (compartilham um Symbol que tem que ser a mesma
  instância). Por isso `vite.config.ts` fica no alvo Node e o app roda em container.
- 🔴 **A URL do Neon: use a direta, sem `-pooler`, nos dois.** O pooler é PgBouncer em
  modo transação e não suporta replicação lógica — o zero-cache falha parecendo erro de
  permissão. E o app aqui é um container único e duradouro, com pool próprio: o pooler só
  fazia falta em serverless, onde cada função abria conexão nova.
- 🔴 **A replicação lógica vem desligada no Neon** (*Settings → Logical Replication*).
  Sem ela o zero-cache morre no boot com `wal_level = logical (currently: replica)`, que
  não diz onde se resolve. E os bancos `zero_cvr` e `zero_cdb` precisam ser criados à mão:
  o zero-cache cria os schemas dentro deles, não os bancos.
- 🔴 **No app server a URL vai em DUAS variáveis com o mesmo valor:** `DATABASE_URL` e
  `ZERO_UPSTREAM_DB`. Parece redundante e não é — `src/zero/server.ts` lê `process.env`
  **direto**, sem passar pelo `env-server.ts`, então o fallback de lá não o alcança.
  Faltando a segunda, `/api/zero/pull` e `/api/zero/push` respondem **404** (não 500): o
  One não registra rota cujo módulo não carrega.
- ⚠️ **As `VITE_*` são embutidas no build**, não lidas em runtime. Trocar o host do
  zero-cache exige reconstruir **e** republicar a imagem, não só mexer no `app.env`.
- ⚠️ **A imagem do app é construída na máquina de desenvolvimento**, não na instância: o
  `Dockerfile` roda `bun install`, que não cabe em 1 GB de RAM. Vai por registry (ghcr.io).
- Diagnóstico em produção: `GET /api/health?diag=<CRON_SECRET>` — devolve ping real no
  banco e o estado de cada variável, com timeout de 4s para não pendurar o health check.
- Migrations contra o Neon: `bun migrate` **não funciona** (`import.meta.glob is not a
  function`). Use `bun migrate:build` e depois, de `src/database`,
  `RUN=1 ALLOW_MISSING_ENV=1 node migrate-dist.js`.

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
14. **O criador (`demo-user-id`) é `role = 'admin'`.** Pendência resolvida na Fase 9,
   por necessidade: sem nenhum admin no banco, **ninguém** abria as abas Planos e
   Pessoas. O `get-session` passa a reportar `admin` sem re-login; a claim do **JWT do
   Zero** continua congelada por 3 anos, e é por isso que as rotas `/api/admin/*` releem
   a role do Postgres.
15. **As escritas de assinatura e pagamento moram em
   `src/features/billing/server/subscriptionActions.ts`.** Três chamadores mexem em
   `subscription` (admin, webhook, cron); se cada um escrevesse do seu jeito, o gate da
   Fase 4 passaria a depender de qual caminho gravou por último.
16. **Plano nunca é apagado, só sai de venda.** É o `requiredPlanId` de posts antigos e o
   `planId` de assinaturas vendidas.
17. **Entrar e criar conta são caminhos separados na UI.** Um campo só que decide
   sozinho exigiria perguntar ao servidor se o e-mail existe — o que entrega a lista de
   cadastrados a quem testar um por um. E `signUp` primeiro faria e-mail com typo virar
   conta nova em vez de "senha incorreta".
18. **Provider social só é registrado quando as credenciais existem.** Registrar sem
   `clientId` faz o Better Auth responder 500: botão que existe e quebra é pior que botão
   que avisa. Quem decide é o servidor, nunca uma flag duplicada no cliente.


## Pendências abertas

- **Produção: o que falta para o app funcionar de ponta a ponta.**
  1. **Rotar a senha do Neon** — ela foi exposta em texto. Trocar no painel e atualizar
     `DATABASE_URL` + `ZERO_UPSTREAM_DB` no `bubble-app` e as três URLs no zero-cache.
  2. **Ligar a replicação lógica no Neon** — sem isso o zero-cache não sobe.
  3. **Trocar a instância da Lightsail para dual-stack.** Ela nasceu IPv6-only; assim,
     quem abrir o site de uma rede sem IPv6 não vê nada.
  4. **Subir os três containers** (`deploy/aws/README.md`), o que inclui construir e
     publicar a imagem do app no ghcr.io.
  5. **Registro `A` para os dois subdomínios** na Vercel, depois do dual-stack. O `AAAA`
     de `bubble.` já está no ar; falta o de `zero.`.
  6. **`VITE_MASTER_USER_ID` de produção está vazio.** O id só existe depois do primeiro
     login real do criador; com ele vazio **o feed de produção abre vazio**. Capturar o
     id no banco, reconstruir e republicar a imagem.
- ~~**`VITE_MASTER_USER_ID` está vazio.**~~ **Preenchido** em `.env.development`
  (`demo-user-id`) desde a Fase 4 — a pendência estava obsoleta. Fica o aviso: **com ele
  vazio o feed abre vazio**, e isso é o comportamento correto, não bug.
- ~~**Não existe cadastro pela UI.**~~ **Resolvido na Fase 10** — telas separadas de
  entrar e criar conta, validadas contra o servidor. O texto original ficou abaixo porque
  descreve o mecanismo que continua valendo (o fallback do servidor para sign-in):

  ~~O Takeout Free nunca chama `authClient.signUp.email`
  fora do botão de demo: a rota `/auth/signup/email` só coleta o e-mail e manda para a
  tela de senha, que chama `passwordLogin` → `signIn.email`. Com e-mail novo dá
  `INVALID_EMAIL_OR_PASSWORD`. O servidor **já suporta** cadastro
  (`app/api/auth/...`, e `src/features/auth/server/apiHandler.ts` intercepta o 422 de
  e-mail existente e cai para sign-in) — falta o cliente chamar. O conserto é espelhar
  `signInAsDemo.ts` dentro de `passwordLogin`. **Não feito: decisão pendente**, porque
  signUp-primeiro faz e-mail com typo virar conta nova. O certo mesmo é separar as telas
  de login e cadastro numa fase de auth.~~
- **Contas existentes hoje:** `demo@takeout.tamagui.dev` / `demopassword123`
  (id `demo-user-id`, é o criador) e `teste@bubble.local` / `teste123456`
  (id `test-user-b`, cobaia do teste de paywall, criada à mão no banco).
- ~~**Seed: metade resolvida.**~~ **Fechado.** `scripts/seed-courses.ts` recria planos,
  curso, módulos e aulas; `scripts/seed-posts.ts` recria os 5 posts. Os dois são
  idempotentes e leem o dono de `VITE_MASTER_USER_ID`, o que é o ponto: em produção o
  criador é outra conta, e copiar as linhas do dev com `feedOwnerId = demo-user-id`
  deixaria o feed vazio. Ordem: `seed-courses` antes, que `p-cac` referencia `plan-anual`.
  ⚠️ A foto do `p-funil` é uma linha de `media` apontando para uma `storageKey` no R2 —
  se o objeto não estiver no bucket, o post aparece sem imagem e o resto não é afetado.
- **`exists` dentro de `exists` não foi validado em runtime** (`canAccessLesson`,
  `canAccessComment`). Se o zero-cache reclamar, o plano B é desnormalizar
  `feedOwnerId`/`visibility` na `lesson`.
- ~~**`canAccessMedia` ignora `requiredPlanId`** de propósito.~~ **Fechado na Fase 5:**
  `src/server/media/mediaAccess.ts` refaz o gate com o tier antes de assinar a URL do R2.
  Falta o usuário provar em runtime (roteiro no handoff 05).
- ~~**Promover o criador a `role = 'admin'`?**~~ **Feito na Fase 9.** Sem admin nenhum
  no banco, as abas Planos e Pessoas eram inalcançáveis. `canUploadMedia()` continua
  aceitando `admin` **ou** `MASTER_USER_ID`; nada mais mudou.
- **Conta Cloudflare R2 e `.env.local`** continuam pendentes — sem eles as rotas de mídia
  respondem 503 e o resto do app funciona normalmente.
- **Fase 1 (Repositório) não foi executada.** O app continua na subpasta
  `mobile-bubble-app/` e o `package.json` ainda se chama `my-bubble-app`. Nada depende
  disso para as fases seguintes, mas continua no plano.
- **Auth: falta recuperação de senha e verificação de e-mail.** Quem esquecer a senha
  não tem saída pela UI; o `magicLink` já está ligado no `authServer` e é o caminho mais
  curto. `emailVerified` nasce `false` e ninguém olha.
- **`APP_NAME` ainda é `'Takeout'`** (`src/constants/app.ts`), então a tela de login diz
  "Entrar no Takeout". Trocar é uma linha — mas **não mexa em `DOMAIN`** junto:
  `DEMO_EMAIL` deriva dele e a conta demo do banco é `demo@takeout.tamagui.dev`.
- **Idioma da UI — ainda aberto, e agora meio a meio.** Tudo que as Fases 5 e 6
  escreveram (feed, detalhe, comentários, mensagens de mídia) é **português literal**;
  o que veio do Takeout (auth, settings) segue em inglês. Ninguém decidiu entre traduzir
  o resto ou adotar i18n. **Cada fase de UI encarece essa decisão** — decidir antes da
  Fase 7 é mais barato que depois.
- **Cobrança: falta o que depende de decisão humana.** Escolher o gateway
  (Stripe/Asaas/Pagar.me/Iugu) e escrever `providers/<nome>.ts` seguindo o `generic.ts`;
  renderizar a tabela de preços em algum lugar do app; agendar
  `/api/cron/expire-subscriptions` (uma vez por dia basta); e chamar `provider.cancel()`
  ao revogar, senão a cobrança segue no gateway.
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
- [`handoffs/08-admin.md`](./handoffs/08-admin.md)
- [`handoffs/09-billing.md`](./handoffs/09-billing.md)
- [`handoffs/10-auth.md`](./handoffs/10-auth.md)
