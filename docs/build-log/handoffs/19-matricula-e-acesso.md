# Handoff 19 — Matrícula e acesso ao curso

## Objetivo

Acesso a curso deixa de ser deduzido da assinatura e passa a ser uma **matrícula**: uma
linha por (pessoa, curso), com origem e data.

## Feito

**Banco** — migration `20261101231444_next_terrax` (o nome é do drizzle):
`course.publishedAt`, `course.subscriberAccess` (`included` | `since-subscription` | `none`)
e a tabela `enrollment` (único por `userId + courseId`). O `.ts` da migration carrega
**dois backfills** que o drizzle não gera: carimbar `publishedAt` dos cursos publicados e
matricular quem já assina. Aplicada: o curso ganhou data e o Assinante de teste nasceu
matriculado (`source = subscription`).

**Servidor**

| Arquivo | O quê |
|---|---|
| `src/server/access/contentAccess.ts` | `subscriberAccessAllows`, `enrollmentSource`, `courseLockReason` (puras); `courseAccess` e `lessonAccess` ganharam o `Set` de matrículas. `LockReason` ganhou `needs-purchase` e `needs-enrollment` |
| `src/server/access/viewer.ts` | `Viewer.subscriptions: Map<creatorId, {id, planId, startedAt}>`, da mesma query; `creators`/`plans` seguem existindo |
| `src/server/content/enrollments.ts` | **novo** — `loadEnrolledCourseIds`, `enroll`, `grantEnrollment`, `revokeEnrollment`, `loadEnrollments`, `revokeEnrollmentsForSubscription` |
| `app/api/enroll+api.ts` | **novo** — `POST /api/enroll`, idempotente; 422 com o motivo quando não há direito |
| `app/api/admin/enrollments+api.ts` | **novo** — lista, conceder (por e-mail) e revogar |
| `courses.ts` / `interactions.ts` | uma query de matrículas (`inArray`) por requisição; DTO ganha `enrolled` e `subscriberAccess` |
| `adminCourses.ts` | `setCoursePublished` carimba `coalesce(publishedAt, now())`; `saveCourse` grava `subscriberAccess` |
| `subscriptionActions.ts` | **o único ponto de revogação**: `cancelSubscription`, `setSubscriptionStatus` (fora de active/trialing) e `expireOverdueSubscriptions` chamam `revokeEnrollmentsForSubscription`. `revokeSubscription` (admin) passa por `cancelSubscription` |
| `mediaAccess.ts` | portão de **aula** só abre por matrícula (`enrollmentOnly`) — sem isso os bytes furavam `since-subscription` e `none`. Capa aceita matrícula também |

**Cliente**: bloco "Quem tem acesso" e lista de **Inscritos** (`CourseEnrollments.tsx`) no
admin do curso; no detalhe do curso, botões por estado (`useEnroll`); `CourseCard` com os
dois motivos novos.

## Decisões

- 🔴 **`needs-enrollment` é motivo próprio** (o plano não previa). Quem tem direito mas não
  clicou "Começar o curso" está **bloqueado** — e a tela precisa de um sinal diferente de
  "Assine". `locked` + `lockReason` bastam, sem campo `canEnroll`.
- 🔴 **Assinar não abre o curso, matricular abre.** Também vale para os bytes da aula.
- `startedAt` = `subscription.createdAt`. `grantSubscription` **reaproveita** a linha ao
  renovar, então `since-subscription` mede desde a **primeira** assinatura, não da última.
- Reativar matrícula revogada reaproveita a linha (mesmo `id`); a origem passa a ser a da
  reativação (revogada por assinatura e depois concedida à mão vira `grant`).
- Conceder à mão é **por e-mail**: o criador (role `user`) não tem a aba Pessoas.
- `needs-purchase` na tela: botão "Comprar este curso" **desabilitado** com a frase "A compra
  avulsa chega em breve". Levar a `/assinar` seria mandar a pessoa a uma tela que não resolve.

## Validado (01/11/2026, navegador + Postgres, contas de teste)

| Verificação | Resultado |
|---|---|
| backfill | `publishedAt` preenchido; Assinante com matrícula `subscription` + `subscriptionId` |
| Assinante sem matrícula | tela mostra **"Começar o curso"**; clicar cria a linha e abre a aula 1 |
| revogar assinatura (`/api/admin/people`) | `revokedAt` preenchido; curso volta a `needs-subscription` e `POST /api/enroll` dá 422 |
| reassinar + "Começar" | **mesma linha** reativada (sem duplicata) |
| concessão à mão, depois revogar a assinatura | matrícula `grant` **sobrevive**; aula segue 200 |
| `since-subscription` com `publishedAt` 60 dias antes | `needs-purchase`; tela mostra "Comprar este curso" e o aviso; enroll 422 `needs-purchase` |
| Visitante | aula 404, enroll 422 `needs-subscription`, `/api/admin/enrollments` 403 |
| e-mail inexistente na concessão | 404 `user-not-found` |

Dados de teste revertidos (curso `included`, `publishedAt` original, `freePreview`,
matrícula do Assinante). `bun check types` limpo (tsc do Windows); `bun test:unit`
**223 passando** (199 + 24 de acesso).

## Conhecido e NÃO resolvido

- ⚠️ **Os botões não foram clicados pela UI nos estados Visitante e Criador.** A matrícula
  do Assinante foi clicada; os demais estados foram provados pelo mesmo DTO/endpoint, e a
  tela de inscritos foi só **lida** (renderiza), sem clicar em Conceder/Revogar — essas
  duas foram exercidas pela API.
- ⚠️ A prova "na CVR do servidor" do plano (item 6) virou prova na **rota** (`/api/lesson`
  e `/api/enroll`): o Zero saiu, a CVR não existe mais.
- ⚠️ Bytes da aula por matrícula **não** foram exercidos em `/api/media/<id>/play` — só a
  regra, por leitura. A aula de teste mais completa (`aula-objecoes`) não tem mídia hoje.
- ⚠️ Não há `src/test/integration` para matrícula. As escritas foram provadas à mão.
- ⚠️ `needs-plan` e `needs-subscription` no `MediaFrame` seguem vindo de `resolveMediaAccess`
  para um assinante **sem matrícula** (ele recebe "plano"): a aula nem chega à tela, então
  não aparece na prática.
- ⚠️ Matrícula de curso despublicado fica no banco; se o curso for republicado volta a valer.
- Compra avulsa e preço: Fase 20.
