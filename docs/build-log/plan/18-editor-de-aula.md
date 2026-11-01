# Fase 18 — Editor de aula

**Status:** ⬜ pendente · **Pré-requisito humano:** — · **Depende de:** nada

## Objetivo

A aula passa a ter vídeo e texto. Hoje o curso é uma lista de títulos.

## Por que esta fase existe

O `CourseCurriculumEditor` cria uma aula com **título e nada mais**, e depois só alterna
"publicada" e "grátis". Não há tela de aula no admin, e nenhuma tela manda `body` ou
`mediaId`. Resultado: as cinco aulas semeadas têm `mediaId = NULL` e o player mostra
"Esta aula ainda não tem vídeo" em todas.

🔴 **O servidor já está pronto.** `updateLesson`
([`src/server/content/adminCourses.ts:198`](../../../src/server/content/adminCourses.ts))
aceita `title`, `body`, `mediaId`, `published` e `freePreview`, e `saveCourse` aceita
`coverMediaId`. O que falta é interface — nenhuma migration é necessária para os itens 1
a 3.

## Escopo

### 1. Tela de edição da aula

Rota nova: **`app/(app)/admin/lessons/[lessonId].tsx`** (mais `_layout.tsx` de 5 linhas,
cópia de `app/(app)/admin/posts/_layout.tsx`).

⚠️ **Rota plana, não aninhada em `courses/[courseId]/`.** `app/(app)/admin/courses/` já
tem o arquivo `[courseId].tsx`; criar uma **pasta** `[courseId]/` ao lado dele dá ao
roteador dois nós com o mesmo nome de parâmetro. O id da aula é único no banco, então a
URL não precisa do curso. O caminho de volta vem da própria aula (`lesson.courseId`).

Campos, na ordem que o composer de post usa (mídia primeiro, porque é o que define o
conteúdo):

| Campo | Componente |
|---|---|
| mídia (vídeo, áudio ou foto) | `LessonMediaField` novo — ver item 2 |
| título | `TextField` de `~/features/admin/fields`, `size="lg"` |
| texto | `TextField` com `multiline` |
| publicada · grátis | `OptionRow` ou os mesmos `Toggle` do currículo |

Moldura e ações: `AdminSection` para o cabeçalho e **`AdminActionBar`** para o Salvar no
celular — as duas em
[`src/features/admin/AdminShell.tsx`](../../../src/features/admin/AdminShell.tsx). O
composer de post (`app/(app)/admin/posts/[postId].tsx`) é o modelo vivo: copie a
**estrutura** dele (rascunho local, `report()` em toast, barra fixa abaixo de `$md`), não
o conteúdo.

O link para esta tela sai do `LessonLine` do `CourseCurriculumEditor`, que hoje só tem
remover e os dois alternadores.

### 2. `LessonMediaField` — uma mídia, não nove

🔴 **Não copie o `PostMediaField`.** Ele carrega grade de até 9 fotos, fila sequencial e
`postMedia` (tabela de vínculo). A aula tem **uma** mídia, por `lesson.mediaId`.

O que é genuinamente compartilhado já está extraído e deve ser usado direto:

- [`useMediaUpload`](../../../src/features/media/useMediaUpload.ts) — assina a URL, faz o
  PUT no R2 com progresso e confirma. É ele que grava `width`, `height` e `durationSec`.
- [`pickFiles`](../../../src/features/admin/pickFile.ts) — abre o seletor e **mede** o
  arquivo, devolvendo `PickedFile` (`blob`, `mime`, `width`, `height`, `durationSec`).
- [`MediaView`](../../../src/features/media/MediaView.tsx) — mostra o que já está lá.

Com isso o componente novo é pequeno: escolher → `upload(picked)` → `updateLesson({
mediaId })`. Trocar a mídia é a mesma coisa; remover é `updateLesson({ mediaId: null })`.

⚠️ **Não apague a linha de `media` ao trocar** — é o que `detachMedia` já evita para o
post: a mídia pode estar em outro lugar, e apagar bytes do R2 não é desta fase.

*Se um terceiro consumidor aparecer*, aí sim extraia um `MediaPicker` comum. Com dois,
extrair cedo custa mais do que repete.

### 3. Capa do curso

`course.coverMediaId` existe, `saveCourse` aceita e o `CourseCard` já renderiza quando
vem — nenhum curso tem capa porque não há campo na tela. Acrescente o mesmo
`LessonMediaField` (aceitando só foto) em
`app/(app)/admin/courses/[courseId].tsx`.

O **ponto focal** já funciona aqui sem código novo: a capa passa pelo mesmo `MediaView`,
e o recorte 16/9 do `CourseCard` respeita `media.focalX/focalY`.

### 4. `durationSec` passa a sair da mídia

Hoje `lesson.durationSec` é coluna solta, preenchida pelo seed — e a tela mostra "12:04"
numa aula **sem vídeo**. Duas verdades para o mesmo número.

Conserto sem perder o dado semeado: o DTO passa a resolver
`media.durationSec ?? lesson.durationSec` em
[`src/server/content/courses.ts`](../../../src/server/content/courses.ts), e **nenhuma
escrita nova** toca `lesson.durationSec`. A coluna fica como resíduo até uma fase de
higiene removê-la; registre isso no handoff.

⚠️ `courseStats` soma as durações para o "1 h 05 min" da capa e do card. Confira que a
soma continua batendo depois da mudança.

### 5. Ordenar e renomear — a dívida que o editor confessa

O comentário em
[`CourseCurriculumEditor.tsx:28`](../../../src/features/admin/CourseCurriculumEditor.tsx)
diz "reordenar de verdade é trabalho futuro". É esta fase.

Hoje: `lesson.order` é **global no curso** e só recebe `max + 1`; não dá para inserir no
meio, mover entre módulos, nem renomear módulo ou aula. Não existe sequer ação
`updateModule` no servidor.

Acrescente em `adminCourses.ts` e na rota `app/api/admin/courses+api.ts`:

| Ação | O que faz |
|---|---|
| `updateModule` | renomear (`title`) |
| `reorderLessons` | recebe a lista ordenada de ids e reescreve `order` **numa transação** |
| `reorderModules` | idem para `courseModule.order` |
| `updateLesson` | passa a aceitar `moduleId`, para mover a aula de módulo |

UI: setas ↑ ↓ em cada linha. **Não** traga biblioteca de arrastar — o admin é web-only,
setas funcionam no teclado e resolvem o caso real (corrigir a ordem de uma aula), e
arrastar numa lista agrupada por módulo é um problema maior do que parece.

⚠️ **Apagar aula apaga o progresso de quem assistiu** (`lessonProgress` é `cascade`).
Hoje reordenar só é possível apagando e recriando — é por isso que esta fase não é
cosmética.

## Qualidade e teste

**Reaproveitar, nominalmente:** `useMediaUpload`, `pickFiles`/`PickedFile`, `MediaView`,
`focalPoint`, `fields.tsx` (`TextField`, `OptionRow`), `AdminShell.tsx` (`AdminSection`,
`AdminActionBar`), `WriteResult` + `requireContentAdmin` + `fail`/`FAIL` no servidor,
`~/helpers/apiFetch` no cliente.

**Sem `any` em código novo.** As telas de admin herdaram `(row as any)` do tempo do Zero;
a dívida fica, não cresce. Tipe o DTO da aula em `src/server/content/dto.ts` e consuma o
tipo.

**Função pura com teste** para o que tem regra: a nova ordem calculada pelas setas
(`moveLesson(lessons, id, direction)`) é pura e vai para `src/test/unit/`, no padrão de
`post-media-rules.test.ts`. Casos de borda: primeira aula subindo, última descendo, aula
fora de módulo, lista com um item.

**Teste de navegador** (`src/test/integration/`): entrar pelo atalho **Criador**, abrir
uma aula, subir um arquivo e conferir que o player mostra. O helper de login está em
`src/test/integration/helpers.ts` e as quatro contas de teste estão em
`src/constants/devAccounts.ts`.

**Prova no Postgres**, não na tela.

## Verificação

1. `bun backend` e `bun dev`; entrar pelo atalho **Criador** na tela de login
2. `/admin/courses/curso-aquisicao` → abrir "Mapeando as 3 objeções reais" → subir um
   vídeo curto → salvar
3. No banco: `select "mediaId", "durationSec" from lesson where id = 'aula-objecoes'` —
   `mediaId` preenchido, e a duração mostrada na tela vem de
   `select "durationSec" from media where id = <aquele mediaId>`
4. Capa: subir uma foto no curso e conferir `course."coverMediaId"`; o card em
   `/home/courses` passa a mostrar a imagem
5. Reordenar: subir a aula 3 para a posição 1 e conferir `select id, "order" from lesson
   order by "order"` — sem buracos e sem empate
6. Renomear um módulo e conferir `courseModule.title`
7. Entrar como **Assinante** e tocar a aula: vídeo abre, retoma de onde parou, conclui
   aos 95%
8. `bun check types` limpo · `bun test:unit` passando
9. **Comitar a versão funcionando**, com a seção "Conhecido e NÃO resolvido"

## Não é desta fase

- **Matrícula, preço e certificado** — Fases 19, 20 e 21
- **Anexo de material** (PDF, planilha) na aula. A descrição do curso semeado promete
  "material que você aplica no mesmo dia" e não existe conceito de anexo; é feature nova,
  com schema próprio
- **Comentário/pergunta na aula** — `comment` é só de post (`comment.postId`)
- **Transcoding/HLS** — decisão travada em `00-contexto.md`: R2 com arquivo direto
- **Apagar bytes do R2** ao trocar a mídia
