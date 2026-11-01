# Fase 21 — Certificado de conclusão

**Status:** ⬜ pendente · **Pré-requisito humano:** — · **Depende de:** 19 (só quem está
matriculado conclui) e 18 (aula com conteúdo para concluir)

## Objetivo

Quem termina o curso ganha um certificado — com uma página pública que prova que ele é
real.

## Por que esta fase existe

A fundação já está pronta e sem uso: `lessonProgress.completedAt` existe desde a Fase 7,
`courseStats` já conta concluídas e total, e a conclusão automática aos 95% funciona. O
que falta é o fim da linha.

E uma regra que você definiu: **curso sem fim definido** (daqueles que ganham aula nova
toda semana) não pode exigir "todas as aulas", senão ninguém conclui nunca. Nesses, o
admin define **quantas aulas** bastam.

## Escopo

### 1. Schema

```ts
// público
course {
  certificateEnabled: boolean().notNull().default(false),
  completionRule: text({ enum: ['all', 'min-lessons'] }).notNull().default('all'),
  minLessons: integer(),          // só faz sentido com 'min-lessons'
}

certificate = pgTable('certificate', {
  id: text().primaryKey(),
  userId: text().notNull().references(() => userPublic.id, { onDelete: 'cascade' }),
  courseId: text().notNull().references(() => course.id, { onDelete: 'cascade' }),
  /** público, é a URL de verificação — não é o id */
  code: text().notNull(),
  issuedAt: timestamp().defaultNow().notNull(),
  /** fotografia do dia da emissão */
  lessonsCompleted: integer().notNull(),
  lessonsTotal: integer().notNull(),
}, (t) => [
  uniqueIndex('certificate_code_uidx').on(t.code),
  uniqueIndex('certificate_userId_courseId_uidx').on(t.userId, t.courseId),
])
```

🔴 **Emitir é gravar uma linha, não calcular na hora.** O curso contínuo ganha aula nova
toda semana; se o certificado fosse derivado, quem concluiu ontem apareceria como "80%
concluído" amanhã. `lessonsTotal` é fotografia — e é por isso que ele está na tabela em
vez de ser lido do curso na hora de mostrar.

**`code` é separado do `id`** porque ele aparece numa URL pública. Gere aleatório e
curto, sem ambiguidade visual (sem `0/O`, `1/l`): 10 caracteres de um alfabeto base32 dão
colisão desprezível, e o índice único protege do resto.

### 2. A regra de conclusão, pura e sem dependência

Arquivo novo **`src/features/courses/completion.ts`**, com **zero imports**:

```ts
export type CompletionRule = { completionRule: 'all' | 'min-lessons'; minLessons: number | null }

export function isCourseComplete(
  rule: CompletionRule,
  counts: { completedCount: number; lessonCount: number },
): boolean
```

⚠️ **Zero imports não é capricho.** A emissão acontece no **servidor** e a tela usa a
mesma regra no **cliente**. `courseStats.ts` importa `./types`, que puxa
`MediaViewMedia` de `MediaFrame.tsx` — e esse arquivo importa Tamagui. Uma função sem
import pode ser chamada dos dois lados sem arrastar UI para o bundle do servidor.

`courseStats` passa a chamar essa função; a tela nunca reimplementa a regra.

Casos de borda que o teste cobre, e todos acontecem:

| Caso | Esperado |
|---|---|
| `minLessons` maior que o total de aulas | nunca conclui — e o admin precisa ser avisado na tela |
| `minLessons` nulo com `completionRule: 'min-lessons'` | trata como `all` (não quebra, não libera de graça) |
| curso sem aula nenhuma | **não** conclui (`0 de 0` não é 100%) |
| `all` com todas concluídas | conclui |
| admin aumenta `minLessons` depois | certificado já emitido continua válido — é linha, não cálculo |

### 3. Emissão

No servidor, em `saveProgress`
([`src/server/content/interactions.ts`](../../../src/server/content/interactions.ts)),
**na mesma transação** que marca a aula como concluída e só quando `completed` vira
verdadeiro:

1. contar aulas publicadas do curso e concluídas por este usuário (duas agregações, uma
   query — invariante 12: nada de contar em laço);
2. `isCourseComplete(...)` com as colunas do curso;
3. se sim e `certificateEnabled`, `insert ... on conflict (userId, courseId) do nothing` —
   a idempotência é o índice único, não um `select` antes (que teria corrida).

A resposta de `/api/progress` ganha `certificateCode?: string` quando emitiu agora. É o
que permite a tela comemorar no instante certo, sem uma segunda requisição.

⚠️ **Não emita para o criador nem para admin.** Eles passam por cima de todo gate
(`isPrivileged`) e "concluiriam" o próprio curso ao revisar uma aula.

### 4. Telas

**Admin — curso**: bloco "Certificado" com ligar/desligar, a regra (`OptionRow`) e o
número mínimo. Avisar em vermelho quando o mínimo passar do total de aulas do curso.

**Aluno — fim do curso**: ao concluir, o detalhe do curso mostra o certificado em vez da
barra de progresso em 100%. E uma lista em Perfil → "Meus certificados".

**Verificação pública — `app/certificado/[code].tsx`**:

🔴 **Fora do guard de `(app)`.** Quem confere um certificado não tem conta neste app. É a
mesma armadilha das páginas legais da Fase 15 — `app/index+ssg.tsx` manda `/` para
`/auth/login`, e rota dentro de `(app)` herda o guard. **Confira em janela anônima**; é o
erro que só aparece quando alguém de fora tenta.

A página mostra: nome de quem concluiu, curso, data, e quantas aulas. Nada de e-mail,
nada de id interno — é página pública.

Uma rota de API própria (`app/api/certificate/[code]+api.ts`), sem sessão, devolvendo só
esses campos. Não reaproveite o endpoint do curso: ele responde com DTO cheio e checa
sessão.

### 5. Impressão, não PDF

A página do certificado é feita para imprimir bem (`@media print`), e o botão é "Imprimir
/ Salvar em PDF" — o navegador gera o PDF.

Gerar PDF no servidor é dependência nova, fonte embutida e um caminho de erro a mais, por
um ganho que o `Ctrl+P` já entrega. Se um dia virar requisito (certificado assinado
digitalmente, por exemplo), aí é fase própria.

## Qualidade e teste

**Reaproveitar, nominalmente:** `courseStats` (contagem), `lessonProgress` e
`isLessonComplete` (`src/features/courses/types.ts`), `WriteResult` e `fail`/`FAIL`,
`AdminSection`/`OptionRow`/`TextField`, `fullDate` de
[`formatDate.ts`](../../../src/features/feed/formatDate.ts) para a data por extenso.

**Função pura com teste:** `isCourseComplete`, com a tabela de bordas acima em
`src/test/unit/course-completion.test.ts`. `course-stats.test.ts` já existe e tem 22
testes — se a mudança tocar `courseStats`, estenda aquele em vez de abrir um terceiro.

**Prova no Postgres:** concluir a última aula tem que deixar **uma** linha em
`certificate`; repetir o `POST /api/progress` não deixa uma segunda.

**Teste de navegador:** a página pública **em janela anônima**, que é o único jeito de
provar que ela está fora do guard. Vale um teste de integração dedicado — é barato e
protege de uma regressão que ninguém percebe logado.

**Sem `any` em código novo.**

## Verificação

1. Curso com `certificateEnabled = true` e `completionRule = 'all'`
2. Entrar como **Assinante**, concluir todas as aulas (o botão "Marcar como concluída"
   serve; não precisa assistir)
3. `select * from certificate` — uma linha, com `lessonsTotal` igual ao número de aulas
   **daquele momento**
4. Publicar uma aula nova no curso e conferir que a linha do certificado **não mudou**
5. `POST /api/progress` de novo na última aula → continua uma linha só
6. Abrir `/certificado/<code>` **em janela anônima**: carrega sem redirecionar para o
   login
7. Trocar para `min-lessons` com `minLessons = 2` noutro curso, concluir duas aulas e
   conferir a emissão
8. `minLessons = 99` num curso de 5 aulas: a tela do admin avisa, e nada é emitido
9. Como **Criador**, concluir uma aula do próprio curso → **nenhum** certificado
10. `bun check types` limpo · `bun test:unit` passando
11. **Comitar a versão funcionando**, com "Conhecido e NÃO resolvido"

## Não é desta fase

- **PDF gerado no servidor** e assinatura digital
- **Certificado de trilha** (vários cursos) — o combo não existe
- **Carga horária como critério.** Foi decidido contar **aulas**: porcentagem desfaz
  conclusão quando o curso cresce, e tempo assistido depende de `durationSec` confiável
  em toda aula
- **Compartilhar no LinkedIn** (a URL pública já é o que isso exigiria, mas a integração
  é outra coisa)
- **Avisar por e-mail que o certificado saiu** — depende da Fase 14
