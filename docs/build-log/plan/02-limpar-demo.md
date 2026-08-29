# Fase 2 — Limpar o demo

**Status:** ✅ concluída · **Handoff:** [`../handoffs/02-limpar-demo.md`](../handoffs/02-limpar-demo.md)

## Escopo (executado)

Remover o vertical de _todo_ do Takeout e criar o gerador de ids do app.

**Apagados** — `src/features/todo/`, `src/data/models/todo.ts`, `src/data/queries/todo.ts`

**Editados** — `src/database/schema-public.ts`, `src/database/relations.ts`,
`src/data/relationships.ts`, `src/data/types.ts`,
`src/data/server/actions/userActions.ts`, `app/(app)/home/(tabs)/feed/index.tsx`,
`src/helpers/crypto/polyfill.native.ts`

**Criado** — `src/helpers/id.ts` (`newId()`)

**Não tocados de propósito** — `src/database/migrations/*` (histórico; o `DROP TABLE
todo` sai na migration da Fase 3) e `src/data/generated/*` (codegen, via
`bun zero:generate`).

## Por que `newId()` existe

`docs/zero.md` (seção "convergence") exige que o **cliente** gere o id e passe pra
mutation. E `crypto.randomUUID` falha em dois cenários reais deste projeto: no web só
existe em **secure context**, sumindo ao testar pelo celular via `http://192.168.x.x:8081`;
no native, o Hermes define um `crypto` parcial sem ela.

## Verificação

`bun zero:generate` → `bun check types` limpo → `bun dev` abre o feed vazio, sem erro de
`crypto.randomUUID`.
