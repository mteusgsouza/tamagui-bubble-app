# 00 — Contexto (leitura comum a todas as fases)

Este arquivo + `docs/build-log/STATE.md` + o arquivo da **sua** fase são tudo que você
precisa ler. Não leia os arquivos das outras fases.

> 🔴 **Atualizado em 01/11/2026: o Zero saiu.** Este arquivo descrevia o Zero (Rocicorp)
> como camada de dados, e a migração de 23/09/2026 o removeu — não há mais `zero-cache`,
> nem publication, nem replica, nem `bun zero:generate`. As seções abaixo foram
> corrigidas; se encontrar menção a Zero em algum plano de fase antigo, leia como
> histórico. O que ficou no lugar está em `STATE.md` → "Migração: o Zero saiu".

## O produto

Plataforma de conteúdo privado de um único criador ("usuário mestre"): feed com texto,
foto, vídeo e áudio + cursos, acessível só a inscritos, com dashboard admin para gerir
usuários, assinaturas e faturamento. Web + iOS + Android.

## O stack (Takeout Free v2-beta, sha `6f803743`)

| Camada | O que já vem pronto |
|---|---|
| Framework universal | **One** (`app/` roteia web + native, `app/api/*+api.ts` são rotas de servidor) |
| Dados | **React Query** no cliente (`src/data/client/`) contra rotas de API; o gate roda no servidor (`src/server/access/`) |
| Banco | **Postgres + Drizzle** (`src/database/schema-public.ts` / `-private.ts`) |
| Auth | **Better Auth** (email/senha, magic link, plugin `admin` com roles) |
| Cobrança | **Stripe** por trás de um adapter (`src/features/billing/`) |
| UI | **Tamagui 2.0-rc** + Reanimated, componentes em `src/interface/` |
| Infra local | `docker-compose.yml` → postgres :5533 + migrate |

Documentação embutida no repo: `docs/takeout.md`, `docs/tamagui.md` e
`docs/zero-historico.md` (só histórico — o Zero não está mais no projeto).
Mais: `bun tko docs list`.

## Decisões travadas

| Decisão | Escolha | Consequência |
|---|---|---|
| Repositório | **Repo único**, sem monorepo | O backend é `app/api/*+api.ts` + `src/server/` |
| Pagamento | **Abstrair** (`plan`/`subscription` agnósticos + adapter) | MVP usa concessão manual pelo admin |
| Vídeo | **R2 + arquivo direto** | Sem transcoding/HLS. `media.provider` permite trocar depois |
| Escopo do MVP | Fundação (feed + mídia) + cursos | Paywall depois, mas o schema já nasce com `visibility` |

**Por que o backend não é separado:** as rotas de API vivem em `app/api/` e compartilham
tipos, enums e DTOs com a tela sem publicar pacote nenhum — é o que mantém o contrato
honesto entre os dois lados. Repo único ≠ processo único: em produção rodam dois serviços
(app One e Postgres).

🔴 **Uma regra, um lugar.** O gate de acesso mora em `src/server/access/contentAccess.ts`
e é **puro** — sem I/O, sem SQL —, o que o torna testável sem banco. Quem carrega as
linhas é o endpoint; quem decide é essa função. Se precisar da mesma regra noutro canto,
**chame**, não copie: já houve uma cópia (em `mediaAccess.ts`) com o comentário "mudou
lá, muda aqui", e foi eliminada.

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

**Quem valida é o usuário**, salvo quando ele disser o contrário na conversa. O agente
não roda `bun install`, `backend`, `dev`, `migrate` nem build nativo por conta própria —
deixa no handoff a lista exata de comandos, em ordem, com o resultado esperado de cada um.

⚠️ **O projeto roda da WSL** (`/mnt/f/...`), onde **file watching não funciona**: toda
edição exige reiniciar o `bun dev`, e o servidor antigo continua servindo o módulo velho
se não for morto com `pkill -f "Onejs:dev"`. As três armadilhas estão no `CLAUDE.md`.

### Formato do handoff

Nesta ordem: **Objetivo** (1 linha) · **Feito** (arquivos com caminho) · **Decisões**
(só o que não é óbvio lendo o código) · **Comandos pro usuário rodar** (em ordem, com
resultado esperado) · **Não feito** (e por quê) · **Contrato pro próximo** (tabelas,
helpers, rotas e tipos que a fase seguinte vai consumir).

### Sequência

**A lista viva é o [`INDEX.md`](../INDEX.md)** — status, dependências e pré-requisito
humano de cada fase, de 1 a 22. Esta seção tinha uma cópia da tabela até a fase 9, e a
cópia envelheceu: mantê-la aqui garantia que uma das duas estivesse errada.

## Riscos conhecidos

1. **Build nativo nunca validado** — só o web subiu até agora. O projeto vive em
   `/mnt/f/` (disco Windows visto do WSL), onde file watching e symlink são o ponto
   fraco conhecido.
2. **`bun tko up`** (sync com upstream do Takeout) fica mais difícil conforme o repo
   diverge do starter.
3. **Takeout Free é v2-beta** — "APIs may change", Tamagui em `2.0.0-rc`. Fixar versões
   e atualizar em janelas conscientes (`upgradeSets` no `package.json`).
4. ~~**Sintaxe de permission do Zero**~~ — não se aplica mais; o gate é código TypeScript
   puro em `src/server/access/`, com teste em `src/test/unit/content-access.test.ts`.
5. **JWT de 3 anos** congela `role`: promover alguém a admin não tem efeito até o token
   renovar. Checar se o plugin `admin` do Better Auth contorna, ou validar admin no
   servidor a partir do banco.
