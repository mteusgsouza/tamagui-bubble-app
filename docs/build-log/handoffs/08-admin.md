# Fase 8 — Admin

## Objetivo

Área administrativa web-only: criar e publicar posts com mídia, montar cursos, e gerir
usuários, assinaturas e faturamento.

## Feito

| Arquivo | O que é |
|---|---|
| [`admin/_layout.tsx`](../../../app/(app)/admin/_layout.tsx) | guard + moldura |
| [`admin/index.tsx`](../../../app/(app)/admin/index.tsx) | visão geral com contagens |
| [`admin/posts/index.tsx`](../../../app/(app)/admin/posts/index.tsx) · [`[postId].tsx`](../../../app/(app)/admin/posts/%5BpostId%5D.tsx) | lista e composer |
| [`admin/courses/index.tsx`](../../../app/(app)/admin/courses/index.tsx) · [`[courseId].tsx`](../../../app/(app)/admin/courses/%5BcourseId%5D.tsx) | lista e editor de curso |
| [`admin/people.tsx`](../../../app/(app)/admin/people.tsx) | usuários, assinaturas, faturamento |
| [`api/admin/people+api.ts`](../../../app/api/admin/people+api.ts) | GET lista · POST conceder/revogar/promover |
| [`canManage.ts`](../../../src/features/admin/canManage.ts) | quem entra no admin |
| [`AdminShell.tsx`](../../../src/features/admin/AdminShell.tsx) | moldura, seção, estado vazio |
| [`MediaPicker.tsx`](../../../src/features/admin/MediaPicker.tsx) | anexar mídia ao post |
| [`CourseCurriculumEditor.tsx`](../../../src/features/admin/CourseCurriculumEditor.tsx) | módulos e aulas |
| [`fields.tsx`](../../../src/features/admin/fields.tsx) | `TextField`, `OptionRow` |
| [`pickFile.ts`](../../../src/features/admin/pickFile.ts) | seletor de arquivo (web) |
| [`queries/admin.ts`](../../../src/data/queries/admin.ts) | 4 queries incluindo rascunhos |
| [`admin-guard.test.ts`](../../../src/test/unit/admin-guard.test.ts) | 6 testes do guard |

Editado: [`MainHeader.tsx`](../../../src/features/app/MainHeader.tsx) ganhou o link do
admin; [`syncedQueries.ts`](../../../src/data/generated/syncedQueries.ts) regenerado
(17 queries, era 13).

## Decisões

**1. Conteúdo pelo Zero, pessoas por rota de API.** Não é preferência de estilo, é o que
o schema permite:

- **Conteúdo**: `canAccessPost`/`canAccessCourse` já começam com
  `cmp('feedOwnerId', userId)`, então o dono do feed enxerga o próprio rascunho.
  Nenhuma permission precisou afrouxar — as queries de `admin.ts` são o mesmo gate visto
  de dentro.
- **Pessoas**: `payment` é tabela **privada**, fora da publication do Zero de propósito.
  E listar assinatura de terceiro exigiria `role = 'admin'` no JWT, que esbarra na
  decisão 3.

**2. Dois níveis de acesso, não um.** `canManage` (admin **ou** `MASTER_USER_ID`) abre o
admin de conteúdo; `canManagePeople` (só `role = 'admin'`) abre a aba Pessoas. O criador
administra o **conteúdo dele**, não a base de usuários. Sem essa separação, o criador
semeado — que tem `role = 'user'` — ficaria trancado para fora da própria área.

**3. A rota de pessoas relê a role do Postgres, não do JWT.** O plano avisava: o token
dura 3 anos, então promover alguém a admin não teria efeito até ele renovar. A rota faz
`SELECT role FROM "user" WHERE id = ...` a cada chamada, então promoção vale na hora.
O `POST setRole` devolve um aviso de que a pessoa promovida precisa sair e entrar para o
**token dela** refletir a mudança.

**4. O id do post nasce na tela e vai na URL.** `/admin/posts/<novoId>?novo=1`. A linha
só é criada no primeiro "Salvar" — abrir "Novo post" e desistir não deixa rascunho órfão.
Salvo, o `?novo=1` sai da URL e a tela passa a editar.

**5. Formulário com rascunho local.** Digitar não pode disparar mutation por tecla: o
Zero grava e sincroniza a cada `mutate`. O estado local é a fonte enquanto se edita; o
"Salvar" é que escreve.

**6. Revogar assinatura marca `canceled`, não apaga.** O histórico importa para
faturamento. Conceder reusa a assinatura existente daquele par (usuário, criador) em vez
de criar uma segunda.

**7. Aula nova entra no fim da numeração global.** `lesson.order` é global no curso, não
por módulo — é o que `lessonPosition`/`lessonAfter` usam. Está comentado no editor porque
é o tipo de coisa que alguém "conserta" errado.

## Comandos pro usuário rodar

```bash
bun zero:generate
```
→ **obrigatório**: a fase criou 4 queries (`adminPosts`, `adminPost`, `adminCourses`,
`adminCourse`). Esperado: `17 queries`. Já rodei, o resultado está commitado.

```bash
bun check types
```
→ limpo, zero erros.

```bash
bun test:unit
```
→ **56 testes** (50 de antes + 6 do guard).

```bash
bun dev
```
→ reinicie: 7 rotas novas.

### Na tela — ✅ EXECUTADO, PASSOU

Entrei como `demo@takeout.tamagui.dev`, cliquei em **Admin** no header e:

1. **Visão geral** mostrou "5 Posts publicados · 0 Rascunhos · 1 Cursos publicados · 5 Aulas"
2. **Posts** listou os 5 com tipo, visibilidade e status
3. **Novo post** → preenchi título e texto → **Salvar** → a linha apareceu no Postgres
   (`published = f`)
4. **Publicar** → `published = t` e `publishedAt` preenchido no banco
5. Apaguei o post de teste

A aba **Pessoas não apareceu** — correto: o criador tem `role = 'user'`. Para testá-la,
promova alguém:

```bash
docker compose exec pgdb psql -U user -d postgres -c "UPDATE \"user\" SET role = 'admin' WHERE email = 'demo@takeout.tamagui.dev'"
```

⚠️ **Depois disso é preciso sair e entrar de novo** — a claim `role` do JWT tem 3 anos de
validade e o token atual continua dizendo `user`.

## Não feito

- **Agendamento de post.** O plano citava "upload + agendamento". `publishedAt` aceita
  data futura no schema, mas nenhuma query filtra por "já passou da hora" — publicar hoje
  é um botão, não um agendador. Faria falta um job; não estava no escopo real da fase.
- **Capa de curso.** O editor não anexa `coverMediaId`. O `MediaPicker` é específico de
  post (`postMedia`); generalizar é meia hora, mas não entrou.
- **Mídia em aula pelo admin.** Prender vídeo à aula ainda é `UPDATE` no banco.
- **Reordenar módulos e aulas.** Só criar e remover. Reordenar exige mexer no `order`
  global de todas as aulas (ver decisão 7).
- **Banir usuário.** O plugin `admin` do Better Auth tem `banUser`; a rota só faz
  promover/rebaixar e conceder/revogar assinatura.
- **Editar planos.** `plan` é lida, nunca escrita. Criar plano continua sendo SQL — é
  candidato natural à Fase 9 (Billing).
- **Seletor de arquivo no nativo.** `pickFile.native.ts` lança erro explicativo. O admin
  é web-only por decisão do plano.
- **Teste de integração do admin.** Não escrevi Playwright para esta fase: o deep link
  quebrado (ver `STATE`) tornaria o teste dependente de navegação em cadeia, e eu já
  validei o fluxo à mão no navegador.

## Contrato pro próximo

### Fase 9 (Billing) herda

```ts
import { canManagePeople } from '~/features/admin/canManage'
```

`POST /api/admin/people` já tem as ações `grant`, `revoke` e `setRole`, com a
autorização lendo a role do Postgres. O adapter de pagamento da Fase 9 pode chamar as
mesmas rotinas ou virar `action: 'charge'` ali.

`GET /api/admin/people` já devolve `paidCents` e `paymentCount` por pessoa, somando
`payment` com `status = 'paid'` — é a base do faturamento.

### O que ainda é SQL

Criar `plan`. A tela de Pessoas lista os planos ativos para conceder, mas ninguém os
cria pela UI. Se a Fase 9 fizer isso, o admin fica completo.

## ⚠️ Interação com o bug de deep link

`admin` é a **primeira rota do grupo `(app)` em ordem alfabética** (antes de `auth` e
`home`). Como o roteador recai na primeira rota do grupo em todo carregamento direto
(ver `STATE.md`), a URL agora pisca em `/admin` antes de chegar ao destino. O destino
final **não mudou** — medi antes e depois. Mas quem for consertar o deep link deve saber
que o alvo do fallback passou a ser o admin.
