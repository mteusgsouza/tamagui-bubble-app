# Fase 7 — Cursos

## Objetivo

Lista de cursos, currículo por módulo e player de aula com o progresso gravado com
debounce — mais a aba de Cursos no tab bar.

## Feito

### Criado

| Arquivo | O que é |
|---|---|
| [`courses/index.tsx`](../../../app/(app)/home/(tabs)/courses/index.tsx) | lista, com filtros Todos / Em andamento / Concluídos |
| [`courses/[courseSlug]/index.tsx`](../../../app/(app)/home/(tabs)/courses/%5BcourseSlug%5D/index.tsx) | currículo, progresso e "Continuar" |
| [`courses/[courseSlug]/[lessonId].tsx`](../../../app/(app)/home/(tabs)/courses/%5BcourseSlug%5D/%5BlessonId%5D.tsx) | player da aula |
| [`courses/_layout.tsx`](../../../app/(app)/home/(tabs)/courses/_layout.tsx) | `Slot`, igual ao do feed |
| [`courseStats.ts`](../../../src/features/courses/courseStats.ts) | contagens, "próxima aula", formatação — módulo puro |
| [`useLessonProgress.ts`](../../../src/features/courses/useLessonProgress.ts) | gravação do progresso com throttle |
| [`CourseCard.tsx`](../../../src/features/courses/CourseCard.tsx) · [`CourseCurriculum.tsx`](../../../src/features/courses/CourseCurriculum.tsx) · [`ProgressBar.tsx`](../../../src/features/courses/ProgressBar.tsx) | componentes |
| [`types.ts`](../../../src/features/courses/types.ts) | formas que a UI consome |
| [`formatDuration.ts`](../../../src/features/media/formatDuration.ts) | extraído do `MediaFrame.tsx` para ser puro |
| [`PlayCircleIcon.tsx`](../../../src/interface/icons/PlayCircleIcon.tsx) | ícone da aba |
| [`scripts/seed-courses.ts`](../../../scripts/seed-courses.ts) | semeia um curso completo (ver Decisões) |
| [`src/test/unit/course-stats.test.ts`](../../../src/test/unit/course-stats.test.ts) | 22 testes das contagens |
| [`src/test/integration/courses.test.ts`](../../../src/test/integration/courses.test.ts) | lista → currículo → aula |

### Editado

- [`src/data/queries/course.ts`](../../../src/data/queries/course.ts) — `courseBySlug`
  novo. `courseDetail` busca por id, mas a rota do plano é `[courseSlug]`.
- [`MediaFrame.tsx`](../../../src/features/media/MediaFrame.tsx),
  [`MediaView.tsx`](../../../src/features/media/MediaView.tsx),
  [`MediaView.native.tsx`](../../../src/features/media/MediaView.native.tsx) —
  `onProgress`, `startAtSec` e `onEnded` (ver Decisão 1).
- [`NavigationTabs.tsx`](../../../src/features/app/NavigationTabs.tsx) e
  [`_layout.native.tsx`](../../../app/(app)/home/(tabs)/_layout.native.tsx) — a aba, nos
  dois arquivos, como o plano avisava.
- `app/routes.d.ts` — entradas das rotas novas (o dev server regenera; a versão dele vence).

## Decisões

**1. O `<MediaView>` passou a expor a reprodução, em vez de eu escrever um player à
parte.** A aula precisa de posição atual, retomada e fim; o `MediaView` já resolve URL
assinada, paywall e as duas plataformas. Duplicar isso em `features/courses/` seria uma
segunda implementação para manter em sincronia. Os três props novos (`onProgress`,
`startAtSec`, `onEnded`) são opcionais — o feed não passa nenhum e não mudou.

Na web sai de `onTimeUpdate`/`onLoadedMetadata` do `<video>`; no nativo, do evento
`timeUpdate` do `expo-video` (precisa de `timeUpdateEventInterval`, que vem **0**, isto
é, desligado). O callback vai numa ref: sem isso, um `onProgress` recriado a cada render
faria o listener do player ser cancelado e reassinado sem parar.

**2. O throttle do progresso é obrigatório, não estético.** O plano já pedia debounce; o
número que fecha a conta está no `package.json`:
`ZERO_PER_USER_MUTATION_LIMIT_MAX` é **30 por minuto**. A web dispara `timeupdate` ~4x
por segundo — sem throttle, 8 segundos de vídeo estouram a cota. `useLessonProgress`
grava no máximo **1x a cada 10 s**, mais um flush ao desmontar (sair da aula no meio
guarda onde parou) e uma gravação imediata ao concluir.

**3. Conclui sozinha aos 95%.** Ninguém assiste os créditos. Fica em
`COMPLETE_THRESHOLD`, junto das outras contas. Também conclui no `onEnded` e no botão
"Marcar como concluída". A mutation `save` da Fase 4 já protege o contrário: aula
concluída não volta a pendente por causa de um replay.

**4. "Continuar" é a primeira aula NÃO concluída, na ordem do currículo** — não a mexida
por último. Quem largou a aula 9 e depois espiou a 20 quer voltar para a 9. O outro caso
(retomar o que mexeu por último) é a query `lessonsInProgress`, que continua sem uso.

**5. A lista de aulas vem de `course.lessons`, não de `modules[].lessons`.** Aula com
`moduleId` nulo é válida no schema e não aparece pendurada em módulo nenhum — vindo da
lista cheia, ela entra em "Outras aulas" em vez de sumir. O currículo filtra a lista cheia
por módulo, então uma aula nunca aparece duas vezes.

**6. Filtro da lista é client-side.** "Concluído" depende do progresso do usuário, que a
query `courses` já traz junto. Uma consulta a mais para filtrar o que está na memória
seria desperdício.

**7. Escrevi um seed — isto está além do que o plano pedia.** Sem curso no banco, esta
fase é inverificável, e o `STATE` já listava "não existe seed versionado" como pendência
aberta. `scripts/seed-courses.ts` cria 2 planos, 1 curso, 2 módulos e 5 aulas, de forma
idempotente. **Não semeia posts**: os 5 que existem foram criados à mão e o script não os
conhece.

**8. Aulas nascem sem mídia.** O seed deixa `lesson.mediaId` nulo — vídeo só entra pelo
upload da Fase 5. A tela mostra "Esta aula ainda não tem vídeo", que é o estado correto,
e prender um vídeo é um `UPDATE` (ver comandos).

## Comandos pro usuário rodar

```bash
bun check types
```
→ limpo. Rodei o `tsc` do repo: **zero erros**.

```bash
bun test:unit
```
→ agora com `course-stats.test.ts`. Esperado: **50 testes passando** (28 de antes + 22).

```bash
bun zero:generate
```
→ **obrigatório**: a Fase 7 criou a query `courseBySlug`, e sem regenerar
`src/data/generated/syncedQueries.ts` ela não existe para o servidor — a tela do curso
fica vazia, sem erro visível. Esperado: `13 queries` (era 12). O erro de `lint:fix` no
fim é o problema conhecido do `STATE`, a geração passa.

```bash
bun backend
```
→ nenhuma migration nova nesta fase; o replica do zero-cache **não** precisa ser
reconstruído.

```bash
bun run:dev scripts/seed-courses.ts
```
→ `✅ curso "Aquisição sem depender de anúncio" semeado · 2 módulos · 5 aulas`.
Precisa do backend no ar. É idempotente: rodar de novo não duplica.

```bash
bun dev
```
→ **reinicie**. Três rotas novas, e o scanner do One não pega arquivo criado com o
servidor no ar. Ele vai regenerar `app/routes.d.ts` — se o diff dele diferir do meu, use
o dele e rode `bun check types` de novo.

### Na tela

1. `http://localhost:8081/home/courses` — a aba nova aparece no header; o curso mostra
   "2 módulos · 5 aulas · 66 min" e o selo "Tem aula grátis".
2. Filtros **Em andamento** / **Concluídos** — vazios até você assistir algo.
3. Abra o curso: currículo com "Módulo 1 · Diagnóstico", "3 aulas · 40 min", e o botão
   **Começar o curso**.
4. Abra uma aula: cabeçalho "DIAGNÓSTICO · AULA 1 DE 5", "Próxima aula" no rodapé.
5. **Marcar como concluída** → volte ao curso: a bolinha enche, a barra anda, o botão
   vira "Continuar: <próxima aula>".

### Para testar o progresso de vídeo de verdade

O seed não põe vídeo. Suba um e prenda a uma aula (o `mediaId` sai do
`bun scripts/media-smoke.ts`):

```bash
docker compose exec pgdb psql -U user -d postgres -c "UPDATE lesson SET \"mediaId\" = '<mediaId>' WHERE id = 'aula-qualificar'"
```

Aí, na aula: assista ~15 s, **saia** (voltar), e reabra — tem que retomar de onde parou.
Assista até o fim → conclui sozinha. Confira no banco:

```bash
docker compose exec pgdb psql -U user -d postgres -c 'SELECT "lessonId", "positionSec", "completedAt" FROM "lessonProgress"'
```

E o que prova a Decisão 2: durante 1 minuto de vídeo deve existir **no máximo ~6 linhas
de escrita**, não 240. Se o console do Zero reclamar de rate limit, o throttle furou.

```bash
bun test:integration
```
→ `courses.test.ts`. Pula sozinho se não houver curso publicado.

## Não feito

- **Material da aula (PDF, anexo).** O mock mostra "roteiro-qualificacao.pdf" e já anota
  "sem tabela no schema". Continua sem: precisaria de tabela nova ou de reusar `media`
  com um `kind: 'file'`. **Decisão de produto, não tomei.**
- **Curtida/comentário em aula.** Só post tem `comment` e `reaction`.
- **`lessonsInProgress` continua sem uso** (ver Decisão 4). Serve para um "Continuar
  assistindo" na home — que não estava no plano desta fase.
- **Sem marcação de aula "atual" no currículo além do tempo parcial.** O mock destaca a
  aula em andamento com "4:12 / 18:30"; isso está feito, mas sem realce de fundo.
- **Ordem das aulas é `order`, global no curso.** O seed numera sequencialmente
  atravessando módulos. Se o admin da Fase 8 permitir reordenar, tem que manter isso —
  `lessonPosition` e `lessonAfter` dependem dessa ordem.
- **Nada validado em runtime por mim** — não rodo `bun dev`, e o Docker estava parado
  quando terminei, então nem consegui conferir se já havia curso no banco.
- **Progresso não testado em nativo.** O caminho do `expo-video` typecheca contra as APIs
  reais, mas ninguém rodou num aparelho.

## Contrato pro próximo

### Reaproveitável

```tsx
import { MediaView } from '~/features/media/MediaView'
import { ProgressBar } from '~/features/courses/ProgressBar'
import { courseStats, formatLongDuration } from '~/features/courses/courseStats'
import { formatDuration } from '~/features/media/formatDuration'
```

`<MediaView>` agora aceita `onProgress`, `startAtSec` e `onEnded` — quem quiser gravar
posição de qualquer mídia usa isso, não um player próprio.

### Escrever conteúdo de curso (Fase 8, Admin)

Tudo pelo Zero, sem rota de API:

```ts
zero.mutate.course.insert({ id: newId(), feedOwnerId, slug, title, ... })
zero.mutate.courseModule.insert({ id: newId(), courseId, title, order })
zero.mutate.lesson.insert({ id: newId(), courseId, moduleId, title, order, published, freePreview })
```

Só o dono do feed escreve nessas três tabelas. **`lesson.order` é global no curso**, não
por módulo — o currículo agrupa por `moduleId` mas a numeração e "próxima aula" seguem
`order`.

Para prender vídeo à aula: suba pelo `useMediaUpload` (Fase 5) e grave
`lesson.mediaId = mediaId`.

### Pendências abertas

1. **Idioma da UI** — continua sem decisão, e mais uma fase inteira nasceu em português
   literal. Ver `STATE.md`.
2. **Material de aula** precisa de decisão de produto antes de virar schema.
3. **O seed de posts não existe.** `scripts/seed-courses.ts` cobre planos e curso; os 5
   posts continuam só no banco de desenvolvimento, sem nada que os recrie.
