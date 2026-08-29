# Fase 1 — Repositório

**Status:** ⏭️ pulada por decisão do usuário · **Pré-requisito humano:** —

## Escopo

Mover o app da subpasta para a raiz do repo e batizar o projeto. Sem monorepo — ver
`00-contexto.md`.

1. `docker compose down` **antes** de mover — o nome do projeto Compose vem do nome da
   pasta, então os containers `mobile-bubble-app-*` viram órfãos depois da mudança.
2. `git mv` do conteúdo de `mobile-bubble-app/` para a raiz `F:\apps\bubble-app\`
   (o `.git` já está na raiz), incluindo os dotfiles. Remover a pasta vazia.
3. Renomear `name` de `my-bubble-app` para `bubble-app` no `package.json`; ajustar
   `app.config.ts` (nome exibido, slug, bundle id iOS / package Android).
4. Commit — baseline pro `bun tko up`, que rastreia o upstream em `.takeout`.

Converter para workspaces só quando existir um segundo package real. Fazer depois é
`git mv` + um `package.json` na raiz, e o risco chato (hoisting de `node_modules`
quebrando React Native) é o mesmo pago hoje ou depois.

## Cuidado

`src/database/vite.config.ts:14` roda `execSync('git rev-parse HEAD')` ao carregar a
config. O repo precisa ter **pelo menos um commit** ou `bun backend` morre no
`migrate:build`. Já resolvido, mas não quebre isso ao mover.

## Verificação

`bun install` → `bun backend` → `bun dev` (web em :8081) → `bun check types` limpo.
Abrir também no celular.
