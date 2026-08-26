# Fase 2 — Limpar o demo

## Objetivo

Remover o vertical de _todo_ que veio no Takeout Free e criar o gerador de ids que todas
as mutations do app vão usar.

## Feito

**Apagados**
- `src/features/todo/` (`index.ts`, `useTodos.ts`)
- `src/data/models/todo.ts`
- `src/data/queries/todo.ts`

**Editados**
- `src/database/schema-public.ts` — removida a tabela `todo` e o índice `todo_userId_idx`.
  Os imports do drizzle continuam iguais: `boolean` ainda é usado por `userState.darkMode`
  e `index` por `userPublic_username_idx`.
- `src/database/relations.ts` — removido o bloco `todo` e a relação `todos` de `userPublic`.
- `src/data/relationships.ts` — removidos `todoRelationships`, a relação `todos` e a
  entrada em `allRelationships`. `userRelationships` passou de `({ one, many })` para
  `({ one })`, já que `many` não é mais usado.
- `src/data/types.ts` — removidos o import de `Todo` e o tipo `TodoWithUser`. O tipo
  `UserWithRelations` foi removido inteiro: seu único campo era `todos`, então sem ele
  virava duplicata exata de `UserWithState`. Ambos estavam sem uso no repo;
  `UserWithState` ficou.
- `src/data/server/actions/userActions.ts` — removido o import de `todo` e o
  `db.delete(todo)` de `deleteAccount()`.
- `app/(app)/home/(tabs)/feed/index.tsx` — demo substituída por um placeholder. Saíram
  também o banner amarelo do starter e o bloco promocional "Takeout Free".
- `src/helpers/crypto/polyfill.native.ts` — guard endurecido (ver Decisões).

**Criado**
- `src/helpers/id.ts` — exporta `newId()`.

## Decisões

**1. `newId()` em vez de `crypto.randomUUID()`.**
`docs/zero.md` (seção "convergence") exige que o **cliente** gere o id e passe pra
mutation — id gerado dentro da mutation diverge entre client e server. E
`crypto.randomUUID` falha em dois cenários reais deste projeto: no web só existe em
**secure context**, então some ao testar pelo celular via `http://192.168.x.x:8081`; no
native, o Hermes define um `crypto` parcial sem essa função. `expo-crypto` (já nas
dependências) resolve os dois.

**2. O guard do polyfill nativo passou a checar a função, não o objeto.**
Era `if (typeof crypto === 'undefined')`, que não pega o caso do Hermes. Em vez de
trocar o guard e substituir o global inteiro, foi adicionado um `else if` que **corrige
só o que falta**:

```ts
} else if (typeof crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = Crypto.randomUUID as any
}
```

Substituir `globalThis.crypto` inteiro descartaria o `getRandomValues` que o runtime já
fornece e do qual o better-auth depende.

**3. Placeholder do feed em inglês.** Todo o texto de UI do Takeout está em inglês
(`"Blocked Users"`, `"You haven't blocked any users."`). O placeholder seguiu o padrão
para não criar um app meio traduzido. **Isso é uma pendência, não uma decisão final** —
está registrada no `STATE.md` para a Fase 6.

## Comandos pro usuário rodar

Nesta ordem, de `/mnt/f/apps/bubble-app/mobile-bubble-app`:

```bash
bun backend
```
→ pgdb `:5533` healthy, migrate sai com 0, zero `:4948` de pé. Deixar rodando noutro
terminal. (Pode pular se já estiver no ar.)

```bash
bun zero:generate
```
→ regenera `src/data/generated/*` sem o `todo` e roda `lint:fix` no fim. **É o comando
que faz o projeto compilar de novo** — até rodar, `src/data/generated/types.ts` ainda
exporta `Todo` e os arquivos gerados ainda referenciam a tabela.

```bash
bun check
```
→ typecheck limpo. Se acusar `Todo` ou `todo`, é sinal de que o `zero:generate` não
rodou ou falhou.

```bash
bun dev
```
→ web em `:8081`. O feed abre com o título "Feed" e "No posts yet.", sem o banner
amarelo. **Sem erro de `crypto.randomUUID`** — não há mais nenhuma chamada a ele, e o
`newId()` ainda não tem consumidor (o primeiro será a Fase 4).

## Não feito

- **`bun zero:generate` não foi executado** — regenerar é papel do usuário, conforme o
  contrato do plano. Enquanto não rodar, `src/data/generated/*` fica dessincronizado e o
  `bun check` acusa erro. É o estado esperado agora.
- **A tabela `todo` continua existindo no Postgres.** Ela saiu do schema Drizzle, mas o
  `DROP TABLE` só aparece na migration que a **Fase 3** vai gerar com `bun migrate`.
  Ninguém edita `src/database/migrations/*` à mão: migrations são histórico.
- **Fase 1 (mover o repositório) não foi tocada** — não foi pedida. O app segue em
  `mobile-bubble-app/` e o `package.json` ainda se chama `my-bubble-app`.
- `app/(app)/home/settings/blocked-users.tsx` continua sendo um stub sem tabela por trás.
  Fica pra uma fatia de moderação futura.

## Contrato pro próximo

**Disponível para uso:**

```ts
import { newId } from '~/helpers/id'
const id = newId() // use em TODO insert, sempre no cliente
```

**Tabelas que existem hoje** em `src/database/schema-public.ts`: `userPublic`,
`userState`. Em `schema-private.ts`: `user`, `account`, `session`, `jwks` (Better Auth).

**Referência apagada, preservada aqui.** O `todo` era o único exemplo funcional de
model + permission + mutation + query no repo. As Fases 3–5 vão precisar do padrão:

```ts
// src/data/models/todo.ts (APAGADO — referência)
import { boolean, number, string, table } from '@rocicorp/zero'
import { mutations, serverWhere } from 'on-zero'

import type { TableInsertRow } from 'on-zero'

export type Todo = TableInsertRow<typeof schema>

export const schema = table('todo')
  .columns({
    id: string(),
    userId: string(),
    text: string(),
    completed: boolean(),
    createdAt: number(),
  })
  .primaryKey('id')

const permissions = serverWhere('todo', (_, auth) => {
  return _.cmp('userId', auth?.id || '')
})

export const mutate = mutations(schema, permissions)
```

```ts
// src/data/queries/todo.ts (APAGADO — referência)
import { serverWhere, zql } from 'on-zero'

const permission = serverWhere('todo', (_, auth) => {
  return _.cmp('userId', auth?.id || '')
})

export const todosByUserId = (props: { userId: string; limit?: number }) => {
  return zql.todo
    .where(permission)
    .where('userId', props.userId)
    .orderBy('createdAt', 'desc')
    .limit(props.limit ?? 100)
}

export const todoById = (props: { todoId: string }) => {
  return zql.todo.where(permission).where('id', props.todoId).one()
}
```

Note o formato dos timestamps: no Zero, `createdAt` é `number()` (epoch ms), enquanto no
Drizzle é `timestamp({ mode: 'string' })`. Manter essa convenção nas tabelas novas.
