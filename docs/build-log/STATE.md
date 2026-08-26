# STATE — Bubble App

> Arquivo vivo. **Primeira leitura obrigatória de todo agente.**
> A especificação de cada fase está em `docs/build-log/PLAN.md`. Leia **apenas a seção
> da sua fase**.

## Onde estamos

| | |
|---|---|
| Última fase concluída | **Fase 2 — Limpar o demo** |
| Próxima fase | **Fase 3 — Modelo de dados** |
| Fase 1 (Repositório) | ⏭️ **pulada por decisão do usuário** — ver "Pendências" |

## Ambiente

- Projeto em `F:\apps\bubble-app\mobile-bubble-app\`, rodado do **WSL Ubuntu-22.04**
  em `/mnt/f/apps/bubble-app/mobile-bubble-app`.
- Abrir o WSL com `wsl --cd /mnt/f/apps/bubble-app` — lançar da pasta do projeto cai
  no bind mount do Docker (`/mnt/wsl/docker-desktop-bind-mounts/...`).
- Subir o backend: `bun backend` → pgdb **:5533**, zero-cache **:4948**, migrate (sai 0).
- Subir o app: `bun dev` → web em **:8081**.
- ⚠️ O README diz Postgres na porta 5444. **Está errado, é 5533** (`docker-compose.yml:12`).
- ⚠️ `src/database/vite.config.ts:14` roda `execSync('git rev-parse HEAD')` ao carregar
  a config. Sem repo git **com pelo menos um commit**, `bun backend` morre no
  `migrate:build`. O repo já existe em `F:\apps\bubble-app\`.
- Validação é feita **pelo usuário**, em web + celular físico. Nenhum agente roda
  `install`, `backend`, `dev`, `migrate` ou build nativo.

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

## Pendências abertas

- **Fase 1 (Repositório) não foi executada.** O app continua na subpasta
  `mobile-bubble-app/` e o `package.json` ainda se chama `my-bubble-app`. Nada depende
  disso para as fases seguintes, mas continua no plano.
- **Idioma da UI.** O código do Takeout está todo em inglês e o placeholder do feed
  seguiu o padrão ("No posts yet."). O produto é para público brasileiro. Decidir na
  Fase 6 se traduz tudo ou adota i18n — não decidir por conta própria antes disso.
- **Build nativo nunca validado.** Só o web subiu até hoje.
- **Sintaxe de permission do Zero** (`q.or`, operador `IN`) não confirmada. Checar em
  `bun tko docs list` antes da Fase 4.

## Handoffs

- [`02-limpar-demo.md`](./02-limpar-demo.md)
