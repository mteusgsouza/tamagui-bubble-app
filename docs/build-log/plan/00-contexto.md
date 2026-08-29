# 00 — Contexto (leitura comum a todas as fases)

Este arquivo + `docs/build-log/STATE.md` + o arquivo da **sua** fase são tudo que você
precisa ler. Não leia os arquivos das outras fases.

## O produto

Plataforma de conteúdo privado de um único criador ("usuário mestre"): feed com texto,
foto, vídeo e áudio + cursos, acessível só a inscritos, com dashboard admin para gerir
usuários, assinaturas e faturamento. Web + iOS + Android.

## O stack (Takeout Free v2-beta, sha `6f803743`)

| Camada | O que já vem pronto |
|---|---|
| Framework universal | **One** (`app/` roteia web + native, `app/api/` são rotas de servidor) |
| Dados / sync | **Zero** (Rocicorp) — queries reativas, permissions server-side, cache local |
| Banco | **Postgres + Drizzle** (`src/database/schema-public.ts` / `-private.ts`) |
| Auth | **Better Auth** (email/senha, magic link, plugin `admin` com roles) |
| UI | **Tamagui 2.0-rc** + Reanimated, componentes em `src/interface/` |
| Infra local | `docker-compose.yml` → postgres :5533 + zero-cache :4948 + migrate |

Documentação embutida no repo: `docs/takeout.md`, `docs/zero.md`, `docs/tamagui.md`.
Mais: `bun tko docs list`.

## Decisões travadas

| Decisão | Escolha | Consequência |
|---|---|---|
| Repositório | **Repo único**, sem monorepo | O backend é `app/api` + `src/data/server` + Zero |
| Pagamento | **Abstrair** (`plan`/`subscription` agnósticos + adapter) | MVP usa concessão manual pelo admin |
| Vídeo | **R2 + arquivo direto** | Sem transcoding/HLS. `media.provider` permite trocar depois |
| Escopo do MVP | Fundação (feed + mídia) + cursos | Paywall depois, mas o schema já nasce com `visibility` |

**Por que o backend não é separado:** `docs/zero.md` exige que as mutations rodem com o
mesmo código no cliente (otimista) e no servidor (autoritativo). Um backend HTTP à parte
custaria sync reativo, cache local, updates otimistas e offline — trocaria de
arquitetura, não só de pastas. Repo único ≠ processo único: em produção rodam três
serviços independentes (app One, zero-cache, Postgres).

## Modelo de execução

Uma fase por agente, em série. Cada agente começa com contexto limpo. O handoff é a
única ponte entre eles.

### Contrato

1. Ler `STATE.md`, este arquivo e `plan/NN-<fase>.md` — **só o da sua fase**.
2. Executar a fase. Não avançar para a próxima, mesmo que pareça trivial.
3. Escrever `handoffs/NN-<fase>.md` e atualizar `STATE.md`.
4. **Corrigir o plano da(s) fase(s) seguinte(s)** com o que você descobriu. O plano é
   documento vivo: se você achou arquivos, APIs ou obstáculos que `plan/NN+1` não
   previa, edite `plan/NN+1` antes de parar. Foi exatamente isso que faltou na Fase 2.
5. Parar. Se esbarrar em decisão humana, escrever a pergunta no handoff em vez de
   escolher sozinho.

**Quem valida é o usuário.** O agente não roda `bun install`, `backend`, `dev`,
`migrate`, `zero:generate` nem build nativo — deixa no handoff a lista exata de
comandos, em ordem, com o resultado esperado de cada um.

### Formato do handoff

Nesta ordem: **Objetivo** (1 linha) · **Feito** (arquivos com caminho) · **Decisões**
(só o que não é óbvio lendo o código) · **Comandos pro usuário rodar** (em ordem, com
resultado esperado) · **Não feito** (e por quê) · **Contrato pro próximo** (tabelas,
helpers, rotas e tipos que a fase seguinte vai consumir).

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

## Riscos conhecidos

1. **Build nativo nunca validado** — só o web subiu até agora. O projeto vive em
   `/mnt/f/` (disco Windows visto do WSL), onde file watching e symlink são o ponto
   fraco conhecido.
2. **`bun tko up`** (sync com upstream do Takeout) fica mais difícil conforme o repo
   diverge do starter.
3. **Takeout Free é v2-beta** — "APIs may change", Tamagui em `2.0.0-rc`. Fixar versões
   e atualizar em janelas conscientes (`upgradeSets` no `package.json`).
4. **Sintaxe de permission do Zero** (`q.or`, operador `IN`) não confirmada. Checar em
   `bun tko docs list` antes da Fase 4.
5. **JWT de 3 anos** congela `role`: promover alguém a admin não tem efeito até o token
   renovar. Checar se o plugin `admin` do Better Auth contorna, ou validar admin no
   servidor a partir do banco.
