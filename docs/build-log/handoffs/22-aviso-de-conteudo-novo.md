# Handoff — Fase 22: aviso de conteúdo novo

## O que entrou

- `post.announcedAt`, `lesson.announcedAt`, `userState.notifyNewPost | notifyNewLesson`
  (migration `20261102025239_careless_maggott`, **com backfill**: o que já estava publicado
  nasce carimbado, senão o 1º job avisaria a base inteira do passado)
- `src/server/content/announce.ts` — **puro**: seleção de destinatários e texto. Os tipos de
  entrada não têm `body`, então o aviso não tem como vazar conteúdo pago
- `src/server/content/announceJob.ts` — varre, **reivindica com
  `UPDATE ... WHERE announcedAt IS NULL RETURNING`**, seleciona, envia
- `app/api/cron/announce-content+api.ts` — `CRON_SECRET`, mesmo padrão do `expire-subscriptions`
- `src/server/email/send.ts` — transporte **mínimo** (Resend por `RESEND_API_KEY` + `EMAIL_FROM`).
  A Fase 14 continua pendente e é quem deve engordar este arquivo
- `app/api/notifications+api.ts` (GET/PUT) + `NotificationSettings` em Ajustes (dois `Switch`)

## Regras que valem

- Post avisa **assinantes ativos** (status e `currentPeriodEnd`), respeitando `requiredPlanId`.
  Aula avisa **matriculados ativos**, não todos os assinantes. Criador e banido não recebem
- Sem provedor configurado o job **não reivindica nada** (`{ ok:false, reason:'no-provider' }`):
  carimbar sem poder enviar apagaria o aviso para sempre
- Janela de 7 dias: conteúdo mais velho é carimbado **sem** enviar (backlog não vira enxurrada)
- Aula de curso despublicado é carimbada **sem** avisar (senão lançar o curso = um e-mail por aula)

## Prova

- `bun test:unit`: **252 testes** (+14 em `announce.test.ts`)
- `bun run:dev scripts/announce-smoke.ts`: 10 verificações verdes no Postgres — segunda rodada
  deixa `announcedAt` no mesmo instante, republicar não reavisa, aula só vai a matriculado
  ativo, nenhum aviso contém o `body`. `tsc` limpo

## Conhecido e NÃO resolvido

- ✅ **Tela de Ajustes validada no navegador** (conta demo): o interruptor de post gravou `notifyNewPost = f` no Postgres e religar voltou a `t`. O de aula não foi clicado
- 🔴 **Nenhum e-mail real saiu.** O smoke usa `send` falso. Falta `RESEND_API_KEY`, `EMAIL_FROM`
  e domínio com SPF/DKIM (pré-requisito humano da Fase 14)
- 🔴 **Ninguém agenda o cron** — a mesma pendência do `expire-subscriptions`
- ⚠️ **Push não foi feito**: exige projeto Firebase + `expo-notifications` + build nativo novo.
  Não existe tabela `pushToken`
- ⚠️ Reivindicar antes de enviar é **no máximo uma vez**: se o envio falhar, não reenvia
- ⚠️ O esqueleto de cron (autenticar segredo, responder contagem) agora existe em **três**
  rotas, copiado; extrair é a próxima mexida
- ⚠️ Sem link de "parar de receber" no e-mail além de "desligue em Ajustes"
