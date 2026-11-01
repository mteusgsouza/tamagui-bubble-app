# Fase 22 — Aviso de conteúdo novo (post e aula)

**Status:** ⬜ pendente · **Pré-requisito humano:** provedor de e-mail com domínio
(SPF/DKIM) para a parte de e-mail; projeto Firebase + build nativo novo para a parte de
push · **Depende de:** 14 (transporte de e-mail) e 19 (matrícula, que diz quem recebe
aviso de aula)

> ⚠️ **Esta fase absorve o item 2 da [Fase 16](./16-operacao-criador.md)** ("Aviso de post
> novo"). Um sistema só avisa as duas coisas; escrever dois seria duplicar o job, a
> tabela de token, a marca de idempotência e o opt-out. A Fase 16 fica com moderação de
> comentário e publicação programada.

## Objetivo

O assinante descobre post novo e o aluno descobre aula nova sem precisar abrir o app.

## Por que esta fase existe

Para produto de assinatura, conteúdo que ninguém sabe que saiu é retenção jogada fora. E
a parte de aula é a mais importante num produto de curso: é o que traz o aluno de volta
no meio da semana.

Hoje não existe nada: `expo-notifications` não é dependência, não há tabela de token, e
🔴 **o projeto não envia e-mail nenhum** — `sendMagicLink` em
[`authServer.ts:102`](../../../src/features/auth/server/authServer.ts) é um
`console.info`. Por isso a Fase 14 é pré-requisito, não sugestão.

## Escopo

### 1. Quem recebe o quê

| Conteúdo | Destinatários | O que o aviso mostra |
|---|---|---|
| Post novo | assinantes ativos do criador que não desligaram o aviso | título + **`teaser`** |
| Aula nova | **matriculados no curso** (Fase 19), não todos os assinantes | nome do curso + título da aula |

🔴 **O aviso nunca carrega o `body`.** A Fase 12 separou `post` de `postContent`
justamente para o conteúdo pago não vazar por caminhos laterais, e notificação é o lugar
mais fácil de vazar sem perceber. Post: `teaser`. Aula: só os títulos.

**Aula avisa quem está matriculado** — é mais certeiro que "todos os assinantes" e sai de
graça da tabela da Fase 19. Quem comprou o curso avulso também recebe, o que é
exatamente o desejado.

### 2. Preferência do usuário — sem tabela nova

`userState` já existe (hoje só com `darkMode`), já tem uma linha por usuário criada pelo
`afterCreateUser`, e é pública. Acrescente ali:

```ts
userState {
  notifyNewPost: boolean().notNull().default(true),
  notifyNewLesson: boolean().notNull().default(true),
}
```

Push sem opt-out é desinstalação. A tela é uma seção em Ajustes, ao lado do tema.

### 3. Marca de "já avisei" — a coluna que torna o job idempotente

```ts
post   { announcedAt: timestamp() }
lesson { announcedAt: timestamp() }
```

🔴 **A reivindicação é atômica, e é isso que garante "exatamente uma vez":**

```sql
UPDATE "post" SET "announcedAt" = now()
 WHERE id = $1 AND "announcedAt" IS NULL
RETURNING id;
```

Se voltou linha, este job é o dono do envio. Se não voltou, outro já pegou. Sem isso, um
retry do cron avisa a base inteira duas vezes — e despublicar e republicar dispara de
novo, que é o mesmo defeito por outro caminho.

**Coluna, e não tabela de `announcement`**, de propósito: a varredura vira
`where published = true and "announcedAt" is null`, que usa índice, e a reivindicação
cabe num `UPDATE`. Com tabela separada seria `NOT EXISTS` mais uma corrida para resolver
na mão.

### 4. O job

Rota `app/api/cron/announce-content+api.ts`, protegida por `CRON_SECRET` — **terceiro
cliente do mesmo padrão** de `expire-subscriptions`.

⚠️ A Fase 16 já avisava: se ao escrever o terceiro job aparecer duplicação, **extraia o
esqueleto comum** (autenticar o segredo, varrer, reportar contagem) em vez de copiar pela
terceira vez.

🔴 **O fan-out não pode estar no caminho do request.** Publicar um post não espera N
envios. O job varre o que foi publicado e ainda não anunciado, reivindica, monta a lista
e envia.

⚠️ **Ninguém agenda o cron hoje.** `expire-subscriptions` existe desde a Fase 9 e continua
sem agendador — é pendência aberta no `STATE`. Esta fase só funciona com agendador em
produção; resolva os dois de uma vez ou registre no handoff que o aviso não sai sozinho.

### 5. Transporte

**E-mail** pelo que a Fase 14 montar. Nada de cliente de e-mail novo aqui.

**Push**: `expo-notifications` + FCM no Android. É módulo nativo — exige `bun check
native-bundle` e **build novo**; o APK atual não tem. Tabela **privada**:

```ts
pushToken { userId, token, platform, updatedAt }   // schema-private.ts
```

Privada porque token de device não tem nada a fazer no cliente, e privada não mexe em
nada que o cliente sincronize.

## Qualidade e teste

**Reaproveitar, nominalmente:** o padrão de `app/api/cron/expire-subscriptions+api.ts`
(segredo, resposta com contagem), `loadViewer`/`enrollment` para montar a lista,
`userState` para a preferência, e o transporte da Fase 14.

**Funções puras com teste** — a seleção de destinatários e a montagem do texto saem do
job e viram módulo puro: recebem as linhas e devolvem a lista. Casos: usuário com aviso
desligado, assinatura vencida no meio, matrícula revogada, post sem `teaser` (usa o
título), aula de curso despublicado (não avisa).

**Prova no Postgres:** rodar o job duas vezes tem que deixar `announcedAt` com o **mesmo**
instante e não gerar segundo envio. Esse é o teste da fase.

**Sem `any` em código novo.**

## Verificação

1. Publicar um post → rodar o job → o aviso chega (e-mail, e push se já houver build)
2. Rodar o **de novo** → zero envios, `announcedAt` inalterado
3. Despublicar e republicar o mesmo post → **continua** sem avisar
4. Publicar uma aula num curso → só quem tem matrícula ativa recebe; revogar a matrícula
   de alguém antes e conferir que essa pessoa ficou de fora
5. Desligar o aviso em Ajustes → próxima publicação não chega para esse usuário
6. Conferir no corpo do aviso que **não** há `postContent.body` nem `lesson.body`
7. `bun check types` limpo · `bun test:unit` passando · `bun check native-bundle` se
   tocou em nativo
8. **Comitar a versão funcionando**, com "Conhecido e NÃO resolvido"

## Não é desta fase

- **Digest** ("3 aulas novas esta semana") — exige janela e agregação
- **Aviso no app** (sininho, lista de notificações lidas/não lidas)
- **Aviso de certificado emitido** e de assinatura vencendo — mesmo transporte, outro
  gatilho; valem uma fase de ciclo de vida
- **Agendador em produção** — é pendência própria, maior que esta fase (ver item 4)
