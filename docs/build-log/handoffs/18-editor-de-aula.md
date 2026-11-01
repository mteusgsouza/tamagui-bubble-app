# Handoff 18 — Editor de aula

## Objetivo

A aula passa a ter vídeo e texto, o curso ganha capa, e o currículo se reordena sem
apagar nada.

## Feito

**Servidor**

| Arquivo | O quê |
|---|---|
| `src/server/content/adminCourses.ts` | `updateModule` (renomear), `reorderLessons`, `reorderModules`, `setCourseCover`. `updateLesson` passou a aceitar `moduleId` **validando que o módulo é do mesmo curso** e rodando numa transação. `saveCourse` só toca `coverMediaId` quando o corpo o traz |
| `app/api/admin/courses+api.ts` | as quatro ações novas no `switch`; `durationSec` saiu do `updateLesson` |
| `src/server/content/courses.ts` | `lessonDuration`: o DTO resolve `media.durationSec ?? lesson.durationSec` |
| `src/data/client/messages.ts` | três mensagens novas (`ordem-desatualizada`, `invalid-module`, `missing-title`) |

**Cliente**

| Arquivo | O quê |
|---|---|
| `app/(app)/admin/lessons/[lessonId].tsx` (+ `_layout.tsx`) | **a tela da aula**: mídia, título, texto, módulo, situação e "aula grátis". Rota plana |
| `src/features/admin/LessonMediaField.tsx` | **novo** — uma mídia só (`pickFile` → `useMediaUpload` → `onChange(mediaId)`), trocar, remover, ajustar recorte (só foto) |
| `src/features/admin/lessonOrder.ts` | **novo, puro** — `moveLesson`, `moveModule`, `sequenceLessons` |
| `src/features/admin/CourseCurriculumEditor.tsx` | setas ↑ ↓ (aula e módulo), "Renomear" módulo, título da aula vira link para a tela nova, aviso "sem vídeo" |
| `app/(app)/admin/courses/[courseId].tsx` | campo **Capa** (só depois do primeiro salvamento) |
| `app/routes.d.ts` | a rota nova, **à mão** (o scanner depende do watcher) |

**Testes:** `src/test/unit/lesson-order.test.ts` (13 casos) e
`src/test/integration/lesson-editor.test.ts` (**escrito, não executado** — ver abaixo).

## Decisões

- 🔴 **A ordem é regravada inteira, não trocada em par.** `reorderLessons` recebe **todos**
  os ids do curso e escreve `order = 0..n-1` num `UPDATE ... CASE` dentro de uma
  transação. Se a lista não for exatamente o conjunto de aulas do curso (outra aba criou
  ou apagou uma), responde 422 `ordem-desatualizada` em vez de gravar uma ordem velha.
  Por isso não há buraco nem empate.
- 🔴 **Setas trocam com a vizinha do mesmo módulo, não com a de cima.** `lesson.order` é
  global, mas a tela agrupa por módulo; a vizinha imediata na lista global pode ser de
  outro módulo. `moveLesson` pula as de fora do grupo.
- **Mexer em módulo refaz a numeração global** (`resequenceLessons`): subir um módulo leva
  as aulas junto, e mover uma aula de módulo a põe no fim do destino. Sem isso a tela e o
  "AULA 3 DE 24" / "próxima aula" do player contariam histórias diferentes. Aulas soltas
  vão por último.
- **A posição mostrada (`#n`) é o índice na lista global**, não `lesson.order` — a coluna
  agora começa em 0.
- **Duração:** `media.durationSec ?? lesson.durationSec`, lida do `leftJoin` direto e não
  do `MediaDTO`, porque duração é vitrine e chega mesmo com a mídia retirada pelo paywall.
  **Nenhuma escrita nova toca `lesson.durationSec`** — a coluna é resíduo do seed, para
  uma fase de higiene remover. `courseStats` soma o que o DTO entrega, então a soma
  acompanha sozinha (validado: o card caiu para "56 min" quando a aula de 9:30 passou a
  ter um vídeo de 1 s).
- **Capa grava na hora** (`setCourseCover`), como a mídia da aula, e o "Salvar" do
  formulário **não a carrega**. Consequência boa: o `saveCourse` antigo zerava a capa
  silenciosamente (`coverMediaId ?? null`) — seria o primeiro bug da fase se a capa
  existisse no formulário.
- **Trocar/remover não apaga `media`** nem bytes do R2 (plano). Sobram órfãs — ver "Não feito".
- Lição lida da lista `GET /api/admin/courses` (já inclui rascunho) em vez de endpoint novo.

## Validado no navegador (01/11/2026, contas de teste)

Criador → `/admin/courses/curso-aquisicao`:

| Verificação | Resultado |
|---|---|
| subir vídeo na aula `aula-objecoes` e salvar | `lesson.mediaId` preenchido; `media.status = ready`, `kind = video`, `durationSec = 1`; **`lesson.durationSec` seguiu 570** (intocado) |
| tela mostra `0:01` | vem da mídia, não da coluna |
| capa: subir PNG 640×360 | `course.coverMediaId` preenchido, `media.width/height = 640/360`; **"Salvar" do curso depois não a apagou**; o card em `/home/courses` renderiza a imagem |
| aula 3 → posição 1 (duas vezes ↑) | `order` = 0,1,2,3,4 **sem buraco e sem empate** |
| renomear módulo | `courseModule.title` atualizado |
| subir o módulo 2 | `courseModule.order` trocou e as aulas acompanharam (0,1 no módulo novo do topo) |
| **Assinante** abre `/home/courses/.../aula-objecoes` | `<video>` carrega do R2 (`readyState 4`), "AULA 5 DE 5" reflete a reordenação, texto da aula aparece, e ao terminar o vídeo marca **concluída** (`lessonProgress.completedAt`) |

Dados de teste foram revertidos no Postgres depois (títulos, ordens, `mediaId`, `body`,
capa e progresso). **Sobraram no R2** dois arquivos de teste (um webm de ~1 s e um PNG).

`bun check types` limpo (tsc do Windows) e `bun test:unit`: **199 passando** (186 + 13).

## Comandos pro usuário rodar

```bash
bun check types
bun test:unit                       # 199 testes
bun run:dev scripts/seed-courses.ts # só se o banco estiver vazio
```

E o teste de navegador novo (não foi executado por mim):

```bash
bunx playwright test src/test/integration/lesson-editor.test.ts
```

## Conhecido e NÃO resolvido

- ⚠️ **O teste de integração `lesson-editor.test.ts` nunca rodou.** Foi escrito contra o
  mesmo padrão dos outros, mas o upload depende de `filechooser` do Playwright e o
  desfazer depende de `lesson-media-remove`. Quem validou o fluxo foi uma sessão manual no
  navegador de automação, não ele.
- ⚠️ **Retomada "de onde parou" (item 7 da verificação) não foi exercida de verdade**: o
  vídeo de teste tinha 1 s, curto demais para parar no meio. O código da Fase 7 não mudou.
- ⚠️ **Mídia órfã no R2** a cada troca ou remoção (decisão do plano). Precisa de uma
  rotina de limpeza em fase própria.
- ⚠️ **Sem arrastar:** só setas, por decisão do plano. Mover uma aula para **outro módulo**
  é pela tela da aula (seletor "Módulo"), não pelas setas.
- ⚠️ **Capa só depois de salvar o curso** — em curso novo o campo some até o primeiro
  "Salvar", porque a linha do curso não existe.
- ⚠️ A tela da aula **não oferece "remover aula"** nem prévia — o remover continua no
  currículo, e apagar a aula apaga o progresso de quem assistiu (`cascade`).
- ⚠️ `lesson.durationSec` segue na tabela. Duas fontes ainda existem; só uma é lida
  primeiro.
- ⚠️ As telas de admin seguem com `as any` herdado do Zero (`[courseId].tsx`); o código
  novo **não** usa `any` (a tela da aula consome `CourseDTO`/`LessonDTO`).
- ⚠️ `app/routes.d.ts` foi editado à mão; o próximo `bun dev` regenera.
- ⚠️ Não validei a tela da aula no **celular** (barra de ação fixa): só no desktop.

## Contrato pro próximo

- `POST /api/admin/courses` ganhou: `updateModule {moduleId,title}`,
  `reorderLessons {courseId,lessonIds[]}`, `reorderModules {courseId,moduleIds[]}`,
  `setCourseCover {courseId,mediaId|null}`; `updateLesson` aceita `moduleId`.
- `lesson.order` é **0-based e contíguo por curso** depois de qualquer reordenação. Quem
  criar aula continua usando `max + 1`.
- `LessonDTO.durationSec` já vem resolvido da mídia — a Fase 21 (certificado) e qualquer
  soma de carga horária devem ler o DTO, não a coluna.
- Fase 19: o curso agora **tem aulas com vídeo de verdade**, então o gate de matrícula
  pode ser exercitado ponta a ponta com `aula-objecoes`.
- `LessonMediaField` é o segundo consumidor de "uma mídia" (aula e capa). Se aparecer um
  terceiro (avatar, anexo), extrair `MediaPicker` comum.
