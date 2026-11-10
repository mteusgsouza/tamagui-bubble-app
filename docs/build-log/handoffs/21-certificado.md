# Handoff 21 — Certificado de conclusão

## Objetivo

Quem termina o curso ganha um certificado, com página pública de verificação.

## Feito

**Banco** — migration `20261102015242_cooing_ezekiel_stane` (aplicada no Postgres local):
`course.certificateEnabled | completionRule | minLessons` e a tabela `certificate`
(`code` único, `(userId, courseId)` único, `lessonsTotal` como fotografia).

| Arquivo | O quê |
|---|---|
| `src/features/courses/completion.ts` | **novo, zero imports** — `isCourseComplete` e `minLessonsUnreachable` |
| `src/features/courses/courseStats.ts` | `courseStats` ganha `complete`, chamando a função acima |
| `src/server/content/certificates.ts` | **novo** — `issueCertificateIfComplete`, código base32 de 10 chars, "meus", verificação pública |
| `src/server/content/interactions.ts` | `saveProgress` virou transação; emite quando `completed` vira verdadeiro; devolve `certificateCode?` |
| `app/api/certificate/[code]+api.ts` | **novo, sem sessão** — só nome, curso, data, aulas |
| `app/api/certificates+api.ts` | **novo** — "Meus certificados" |
| `app/certificado/[code].tsx` | **novo, fora de `(app)`** — `@media print` + botão "Imprimir / Salvar em PDF" |
| admin do curso | bloco "Certificado": liga/desliga, regra, mínimo, erro e aviso vermelho se o mínimo passa do total |
| aluno | `CertificateLink` no lugar da barra de progresso (detalhe do curso) e na aula; `MyCertificates` em Ajustes |
| `scripts/certificate-smoke.ts` | **novo** — prova a emissão no Postgres sem servidor |

## Decisões

- A página pública busca com `fetch` simples, **não** React Query: o `QueryClientProvider`
  mora no layout de `(app)`, que a página evita de propósito.
- O total/concluídas contam só aulas **publicadas** (rascunho não impede nem libera).
- `minLessons` só é gravado quando a regra é `min-lessons`; trocar para `all` zera o campo.
- Criador e admin nunca recebem certificado (`viewer.isAdmin || feedOwnerId === viewer.id`).
- `app/routes.d.ts` editado à mão (`/certificado/[code]`).

## Validado (02/11/2026)

`scripts/certificate-smoke.ts` contra o Postgres local — 12 verificações verdes: `all` não emite
com 1 e 2 de 3, emite na 3ª e devolve o código; **uma** linha; fotografia 3/3; repetir não
duplica; aula nova não muda o certificado; a verificação pública devolve exatamente
`code, courseTitle, holderName, issuedAt, lessonsCompleted, lessonsTotal`; `min-lessons 2`
emite na 2ª aula; `min-lessons 99` em curso de 5 não emite; criador não ganha. Dados de teste apagados.
`tsc --noEmit` limpo; **238 testes** (228 + 7 de `isCourseComplete` + 3 de `courseStats.complete`).

## Validado no navegador (02/11/2026, com as contas de teste)

- Assinante concluiu as 5 aulas clicando em "Marcar como concluída": 4 aulas → 0 certificados; 5ª → **1 linha** (5/5), cartão do certificado aparece na própria aula e no lugar da barra no detalhe do curso, e "Meus certificados" lista
- `/certificado/<code>` mostra nome, curso, "5 de 5 aulas", data e código, com o botão "Imprimir / Salvar em PDF"
- **sem sessão** (`127.0.0.1:8081`, outra origem de cookies, `document.cookie` vazio): a página abre na própria URL, sem ir ao login
- Criador no admin: bloco "Certificado" aparece; com `min-lessons` e 99 o aviso vermelho "passa do total (5)" surge; salvar grava `min-lessons`/`99`
- Dados de teste revertidos (curso sem certificado, certificado e progresso apagados)

## Comandos pro usuário rodar

```bash
bun run:dev scripts/certificate-smoke.ts      # esperado: ✅ tudo verde
pkill -f "Onejs:dev"; bun dev                 # reinicia o servidor com o código novo
bun test:integration                          # inclui certificate-page.test.ts
```

Depois, no navegador (itens 2, 6, 8 da Verificação do plano): ligar o certificado num curso,
concluir as aulas como Assinante, abrir `/certificado/<code>` **em janela anônima**, e ver o
aviso vermelho no admin com `minLessons = 99`.

## Conhecido e NÃO resolvido

- ⚠️ `@media print` e o diálogo de impressão **não foram exercidos**; só a tela foi vista.
- ⚠️ Verificada anônima pela origem `127.0.0.1`, não por janela anônima real; o fetch sem cookie equivale, mas não é idêntico.
- ⚠️ `certificate-page.test.ts` (Playwright) foi escrito e **nunca executado**; testa código
  inexistente (a página abre sem redirecionar e a API responde 404), não um certificado real.
- ⚠️ A API pública foi provada pela função (`loadPublicCertificate`), não por HTTP.
- ⚠️ Matrícula revogada depois da emissão não afeta o certificado (é linha, por desenho).
- ⚠️ Alguém que já concluiu um curso **antes** de ligar o certificado não recebe nada
  retroativo; só emite na próxima conclusão de aula. Sem backfill.
- ⚠️ Sem teste de integração automatizado de `saveProgress` (o smoke é script manual).
- ⚠️ Nativo: `/certificado/<code>` não foi exercido; o botão de impressão só existe na web.

## Contrato pro próximo

`certificate` (pública), `issueCertificateIfComplete(tx, viewer, courseRow)`,
`CourseDTO.certificate`/`certificateEnabled`/`completionRule`/`minLessons`,
`GET /api/certificate/<code>` (sem sessão) e `GET /api/certificates`. A Fase 22 pode avisar
"certificado emitido" reaproveitando o `certificateCode` da resposta de `/api/progress`.
