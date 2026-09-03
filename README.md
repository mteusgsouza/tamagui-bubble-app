<div align="center">

<img src="assets/logo.png" alt="Bubble" width="96" height="96">

# Bubble

**Plataforma de conteúdo por assinatura, de um criador só.** Feed com texto, foto, vídeo
e áudio · cursos com módulos e aulas · conteúdo aberto ou trancado para assinantes · admin
web para publicar tudo isso.

Web · iOS · Android — um código só.

`versão 1.0.0` · `MIT` · `pt-BR`

</div>

---

## O que é

Um app onde **um único criador publica e a audiência assina para ver**. Não é rede social:
não existe feed de terceiros, nem seguir, nem publicar de quem entra. Existe o criador
(`role = admin`), o conteúdo dele, e quem paga para acessar.

A regra que organiza o produto inteiro é uma só: **cada peça de conteúdo é `public` ou
`subscribers`** — e, quando é de assinante, pode ainda exigir um **plano específico**
(ex.: um curso só no plano anual). O gate é resolvido no servidor, num join, nunca numa
flag do cliente.

## Marca

<img src="public/brandmark.svg" alt="brandmark" width="28" height="28" align="left">

A marca é um quadrado arredondado no âmbar da casa com duas bolhas escuras dentro — a
"bubble". Vive em três formatos: [`src/interface/app/LogoIcon.tsx`](src/interface/app/LogoIcon.tsx)
(SVG no app, lendo tokens do tema), [`public/brandmark.svg`](public/brandmark.svg) (web) e
[`assets/logo.png`](assets/logo.png) (splash e ícone nativo).

| | |
|---|---|
| Âmbar (marca) | `#e5a33a` — `$accent9` / `$accentBackground` |
| Tinta sobre o âmbar | `#141414` — `$accentColor` |
| Rampa completa | `$accent1`–`$accent12`, claro e escuro, em [`src/tamagui/brandAccent.ts`](src/tamagui/brandAccent.ts) |

🔴 **Hex de acento dentro de componente é bug.** A cor é token; a única exceção
documentada é o `tabBarActiveTintColor` do react-navigation, que não lê token.

## Funcionalidades

### Feed

- Posts de **texto, foto, vídeo e áudio**, com carrossel de até 9 fotos e indicador "1/3"
- Player próprio para vídeo e áudio (`<MediaView>`, web e nativo), com poster
- **Curtir**, **comentar** e **responder** comentário; apagar o próprio comentário
- Contadores desnormalizados (`likeCount`, `commentCount`) mantidos pelas mutations
- Detalhe do post em rota própria e paginação por limite crescente
- Tudo **reativo**: publicou no admin, aparece no feed já aberto sem recarregar

### Cursos

- Curso → **módulos** → **aulas**, com aula podendo ficar solta fora de módulo
- Lista com filtros **Todos / Em andamento / Concluídos**
- **Progresso por aula**: retoma de onde parou (`positionSec`) e conclui sozinho no fim
- **`freePreview`**: aula liberada mesmo num curso de assinantes — a amostra grátis
- Barra de progresso do curso calculada do progresso real do usuário

### Assinatura e paywall

- **`plan`** (nome, preço, moeda, intervalo mensal/anual, à venda ou fora) e
  **`subscription`** (status `trialing` · `active` · `past_due` · `canceled` · `expired`)
- Gate por **join de duas colunas** (`feedOwnerId`+`requiredPlanId` → `creatorId`+`planId`):
  post/curso sem plano exigido abre para qualquer assinatura ativa; com plano exigido, só
  para aquele plano
- **Adapter de cobrança** (`manual` e `generic`), webhook assinado com HMAC, rota de
  checkout e job de expiração de assinatura vencida
- Concessão e revogação manual de assinatura pelo admin, com histórico de pagamento

### Conta

- **Cadastro e login por e-mail e senha**, em caminhos separados e deliberados
- Login **Google** (OAuth 2.0). O provider só é registrado quando `GOOGLE_CLIENT_ID` e
  `GOOGLE_CLIENT_SECRET` existem — sem elas o botão avisa em vez de quebrar
- Conta demo de um clique (só em desenvolvimento ou com `VITE_DEMO_MODE=1`)
- Perfil editável, tema **claro / escuro / sistema**, sair

### Admin (web)

- **Posts**: composer com upload de mídia e progresso, rascunho vs. publicado,
  visibilidade, plano exigido, apagar
- **Cursos**: editor de currículo — criar e reordenar módulos e aulas, anexar mídia,
  marcar `freePreview`
- **Planos**: CRUD; plano nunca é apagado, só sai de venda (é `requiredPlanId` de posts
  antigos e `planId` de assinaturas já vendidas)
- **Pessoas**: usuários, assinaturas e faturamento — a única área que **não** usa Zero,
  porque `payment` é tabela privada
- Dois níveis: `canManage` (criador ou admin) abre o admin de conteúdo; `canManagePeople`
  (só `role = admin`) abre Pessoas e Planos

### Mídia

- Upload **direto do navegador/app para o Cloudflare R2** com URL assinada — nenhum byte
  atravessa o servidor do app
- Leitura por **302** para URL assinada, com o gate de assinatura refeito antes de assinar
- Limites por tipo: foto 25 MB · áudio 200 MB · vídeo 1 GB; allowlist de mime explícita
- TTL da assinatura por uso: 5 min para imagem, **4 h para vídeo/áudio** (o player
  revalida a cada `Range`; trocar o `src` no meio reiniciaria a reprodução)

## Ainda não pronto (mas no escopo)

| | Estado |
|---|---|
| **Tela de assinar** | ⏳ Os planos existem e o gate funciona, mas **não há tela onde o usuário clique para assinar**. Hoje a assinatura é concedida pelo admin |
| **Gateway de pagamento real** | ⏳ `BILLING_PROVIDER=manual`. O adapter e o webhook estão prontos; falta escolher Stripe/Asaas/Pagar.me e escrever `providers/<nome>.ts` seguindo o `generic.ts`. `POST /api/billing/checkout` devolve **501** de propósito enquanto o provider for o manual |
| **Agendar a expiração** | ⏳ `/api/cron/expire-subscriptions` existe e é protegida por `CRON_SECRET`, mas nada a chama sozinha — assinatura vencida segue liberando conteúdo |
| **Recuperar senha / verificar e-mail** | ⏳ `magicLink` já está ligado no servidor; falta a UI. `emailVerified` nasce `false` e ninguém olha |
| **Inglês (i18n)** | ⬜ Está no escopo, sem prioridade hoje. A UI é em português e ainda não há camada de tradução |

Detalhe de cada pendência em [`docs/build-log/STATE.md`](docs/build-log/STATE.md).

## Soluções usadas

| Peça | Escolha | Por quê |
|---|---|---|
| Framework | **[One](https://onestack.dev)** 1.14.2 | Rotas por arquivo para web **e** nativo, com API routes (`app/api/*+api.ts`) no mesmo repo |
| UI | **[Tamagui](https://tamagui.dev)** 2.0.0-rc.34 | Um componente que compila para DOM e para React Native, com tema e tokens de verdade |
| Sync | **[Zero](https://zero.rocicorp.dev)** 0.26.2 (Rocicorp) | Query reativa com mutation otimista: o app parece local, e o servidor continua sendo a autoridade |
| Auth | **[Better Auth](https://www.better-auth.com)** 1.3.32 | E-mail/senha + social + JWT para o Zero, com hooks na criação de usuário |
| ORM / schema | **[Drizzle](https://orm.drizzle.team)** 1.0.0-beta.9 | Schema em TS, migrations versionadas, e a publication do Zero derivada dele |
| Banco | **Postgres 16** | Replicação lógica é o que alimenta o zero-cache |
| Mídia | **Cloudflare R2** | PUT assinado direto do cliente; sem egress e sem passar bytes pelo app |
| Runtime | **Bun 1.3.9** · Node 24.3.0 | |
| Nativo | **Expo 55** · React Native 0.83.2 · React 19.2 | |
| Testes | **Vitest** (94 unitários) · **Playwright** (15 de integração) | |

### As quatro decisões que explicam o resto

1. **Mutation do Zero roda duas vezes** — otimista no cliente, autoritativa no servidor.
   Por isso `newId()` e `Date.now()` saem da **tela**, nunca de dentro da mutation: senão
   cliente e servidor geram valores diferentes e o dado diverge.
2. **O paywall é join no servidor, não claim de JWT.** O token dura 3 anos; qualquer
   entitlement embutido nele ficaria congelado. As permissions de leitura vivem em
   [`src/data/where/canAccessContent.ts`](src/data/where/canAccessContent.ts) e rodam
   server-side — o cliente nunca recebe a linha que não passa.
3. **Bytes de mídia não passam pelo servidor do app.** Ele só assina URL e decide quem
   pode. Corolário: **a tela nunca monta URL de R2**; tudo vai por `<MediaView>` ou
   `/api/media/[id]/play`.
4. **Defaults fecham, não abrem**: `visibility = 'subscribers'`, `published = false`.
   Conteúdo esquecido no default fica trancado, não vazado.

## Modelo de dados

**Público** (replicado pelo Zero, [`schema-public.ts`](src/database/schema-public.ts)):
`userPublic` · `userState` · `plan` · `subscription` · `media` · `post` · `postMedia` ·
`comment` · `reaction` · `course` · `courseModule` · `lesson` · `lessonProgress`

**Privado** (fora da publication, [`schema-private.ts`](src/database/schema-private.ts)):
`user` · `account` · `session` · `jwks` · `verification` · **`payment`**

FKs de conteúdo apontam para **`userPublic`**, nunca para `user` — `user` é privada e não
é replicada, então uma FK para ela seria invisível no cliente. Só `payment` referencia
`user`.

## Estrutura

```
app/
├── (app)/
│   ├── auth/                    login, senha, cadastro
│   ├── home/(tabs)/             feed · cursos · perfil
│   └── admin/                   posts · cursos · planos · pessoas (web-only)
└── api/
    └── auth/ · media/ · billing/ · admin/ · cron/ · zero/ · health
src/
├── features/                    feed, courses, media, admin, auth, billing, theme
├── interface/                   componentes reutilizáveis (Logo, Button, MediaView…)
├── data/                        schema do Zero, models, queries, permissions
├── database/                    schema Drizzle + migrations
├── server/                      env, cliente R2, gate de mídia
└── tamagui/                     tema e a rampa da marca
docs/build-log/                  STATE.md, as 10 fases e seus handoffs
deploy/                          produção (AWS Lightsail, Caddy, Compose)
```

## Rodando

Requer **Bun**, **Docker** e **Git**. O projeto roda da WSL.

```bash
bun install
bun backend    # docker: postgres :5533 + zero-cache :4948 + migrate
bun dev        # app em http://localhost:8081
```

Depois, para ter conteúdo na tela — nesta ordem, que os posts referenciam um plano:

```bash
bun run:dev scripts/seed-courses.ts && bun run:dev scripts/seed-posts.ts
```

Contas de desenvolvimento: `demo@takeout.tamagui.dev` / `demopassword123` (é o criador,
`role = admin`) e `teste@bubble.local` / `teste123456`.

### Nativo

```bash
bun ios          # simulador iOS
bun android      # emulador Android
```

Builds pelo **EAS**, com três perfis em [`eas.json`](eas.json): `development`
(dev client), `preview` (interno; APK no Android) e `production` (`autoIncrement`).
O `app.config.ts` troca nome e bundle id por `APP_VARIANT`, então as três variantes
convivem no mesmo aparelho.

### Comandos

| | |
|---|---|
| `bun check types` | typecheck (**`bun check` sozinho não roda nada**) |
| `bun test:unit` | 94 testes de unidade |
| `bun test:integration` | Playwright |
| `bun run:dev scripts/x.ts` | script com env — **sem um segundo `bun`** |
| `bun zero:generate` | **obrigatório** ao criar query ou mutation nova |
| `bun env:update` | propaga o bloco `env` do `package.json` |
| ~~`bun check lint`~~ | quebrado: `panic: unknown rule` — `.oxlintrc.json` liga uma regra que o `oxlint-tsgolint` instalado não conhece |

🔴 **File watching não funciona** — o projeto vive em `/mnt/f` (disco Windows visto da
WSL). Toda edição exige reiniciar o `bun dev`, e o processo se chama `Onejs:dev`, não
`one dev`. As armadilhas completas estão em [`CLAUDE.md`](CLAUDE.md).

## Versões

A versão do app é **1.0.0** e mora em **dois arquivos por necessidade**:
[`package.json`](package.json) — de onde o `app.config.ts` lê, com `require` de JSON,
porque o carregador de config do Expo não resolve import de `src/` — e
[`src/constants/app.ts`](src/constants/app.ts), de onde a tela de Perfil lê. O teste
`src/test/unit/app-version.test.ts` falha se os dois divergirem; antes dele o build dizia
0.0.1 enquanto a tela mostrava v1.0.0.

Ao subir a versão, mexa nos dois. Ela também vira o `runtimeVersion` do build nativo.

| | |
|---|---|
| App | **1.0.0** |
| Bundle id | `com.mteusgsouza.bubble` (`.dev` e `.preview` nas outras variantes) |
| EAS | projeto `bubble-app`, owner `mteusg` |
| iOS mínimo | 17.0 · Xcode 26.0 |
| Bun / Node | 1.3.9 / 24.3.0 |
| One / Tamagui / Zero | 1.14.2 / 2.0.0-rc.34 / 0.26.2 |
| Expo / React Native / React | 55 / 0.83.2 / 19.2.0 |
| Postgres | 16 |

## Produção

Três provedores, porque cada peça exige uma coisa diferente:

| Peça | Onde | Por quê |
|---|---|---|
| App server + zero-cache | **AWS Lightsail** ([`deploy/aws/`](deploy/aws/)) | uma máquina, um Caddy, dois subdomínios |
| Postgres | **Neon** (`sa-east-1`) | free tier serve |
| Mídia | **Cloudflare R2** | PUT direto do navegador, com CORS por origem |

Publicar: `bash scripts/deploy.sh`. Diagnóstico no ar:
`GET /api/health?diag=<CRON_SECRET>`.

⚠️ **A Vercel não serve para o app server** (as funções serverless que o One gera não
levam `node_modules`) e **o Fly saiu** (trial de 7 dias, sem domínio próprio). As demais
armadilhas de deploy — replicação lógica desligada no Neon, URL sem `-pooler`, `VITE_*`
embutidas no build — estão em [`docs/build-log/STATE.md`](docs/build-log/STATE.md) →
Produção.

## Documentação

- [`docs/build-log/STATE.md`](docs/build-log/STATE.md) — **leia primeiro**: ambiente,
  decisões acumuladas e pendências
- [`docs/build-log/INDEX.md`](docs/build-log/INDEX.md) — as 10 fases de construção
- [`docs/build-log/handoffs/`](docs/build-log/handoffs/) — o que cada fase entregou e por quê
- [`CLAUDE.md`](CLAUDE.md) — invariantes e armadilhas do ambiente

## Idioma

Interface e comentários em **português**. Uma versão em inglês está no escopo, mas ainda
não é prioridade — não há camada de i18n, e algumas telas mais antigas ainda têm texto em
inglês. Ao mexer num arquivo, traduza o que tocar.

## Licença

MIT — ver [LICENSE](LICENSE). O Tamagui entra como base de UI, não como andaime: o
produto, o modelo de dados e as regras deste repo são próprios.
