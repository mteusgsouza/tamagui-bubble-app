# Fase 16 — Operação do criador

**Status:** ⬜ pendente · **Pré-requisito humano:** projeto Firebase para push no Android
(gratuito) · **Depende de:** 12 (o teaser é o que a notificação anuncia) e 14 (transporte
de e-mail)

## Objetivo

O criador publica e não tem como moderar, avisar ninguém, nem programar. São as três
lacunas que aparecem no dia 2 de uso, não no dia 1.

## Escopo

### 1. Moderação de comentário — e o mecanismo de hoje não funciona

`src/data/models/comment.ts:23` diz que "o dono do feed modera pelo admin (role admin passa
por cima via `defaultAllowAdminRole`)". **Duas coisas erradas nisso:**

1. Não existe tela de comentários no admin. As rotas são `index`, `posts`, `courses`,
   `plans`, `people`.
2. 🔴 O bypass por `defaultAllowAdminRole` lê a claim `role` do **JWT do Zero, que está
   congelada por 3 anos** (decisão 14 do `STATE`). O criador foi promovido a `admin`
   depois de o token existir. Ninguém nunca provou que ele consegue apagar comentário de
   terceiro — e a hipótese mais provável é que **não consiga**.

**O conserto certo não passa por role.** Acrescente a permission explícita em `canWrite`
de `comment`: o dono do post pode dar `softDelete` em comentário do post dele. É um
`exists('post', feedOwnerId = auth.id)` — a mesma forma do resto do gate, que não depende
de claim nenhuma e continua valendo quando o token renovar. Corrija o comentário do código
junto: ele documenta um mecanismo que não é o real.

Tela: lista dos comentários recentes do feed do criador, com apagar. Reaproveite
`CommentList` em vez de criar uma segunda árvore de comentário.

⚠️ `softDelete` já decrementa `post.commentCount` na mesma transação. Não mexa nessa conta
por fora.

### 2. Aviso de post novo

O assinante só descobre post novo se abrir o app. Para produto de assinatura, é retenção
jogada fora.

Push (`expo-notifications` + FCM no Android, sem custo) e e-mail pelo transporte da Fase 14.
Tabela **privada** `pushToken (userId, token, platform, updatedAt)` — token de device não
tem nada a fazer no Zero, e privada não mexe na publication.

Cuidados que decidem se isso presta:

- 🔴 **O fan-out não pode estar no caminho do request.** Publicar um post não pode esperar
  N envios. Rota `app/api/cron/*` protegida por `CRON_SECRET` varrendo o que foi publicado
  e ainda não avisado — o mesmo padrão do `expire-subscriptions`, e a coluna "já avisei"
  é o que torna o job idempotente
- **Exatamente uma vez por post.** Despublicar e republicar não pode disparar de novo. Sem
  a marca de envio, um retry do job avisa a base inteira duas vezes
- **O que o aviso mostra é o `teaser`**, nunca o `body` — a Fase 12 separou os dois
  justamente para isso, e notificação é o lugar mais fácil de vazar conteúdo pago sem
  perceber
- Preferência por usuário, e um jeito de desligar. Push sem opt-out é desinstalação

### 3. Publicação programada

`post.publishedAt` já existe e o gate filtra por `published` (boolean), então post agendado
fica `published = false` até a hora — **sem risco de vazar**, e é por isso que este desenho
é seguro: a data não decide acesso, a flag decide.

Campo de data no composer + job que vira a flag quando a hora passa. Terceiro cliente do
mesmo padrão de cron; se ao escrever o terceiro job aparecer duplicação, extraia o
esqueleto comum em vez de copiar pela terceira vez.

⚠️ Fuso: guarde UTC, mostre local. `publishedAt` é `timestamp` com `mode: 'string'`.

## Verificação

1. Comentário de terceiro apagado **pelo criador** — e confirmado no Postgres, não só na
   tela. É o que nunca foi provado
2. Terceiro tentando apagar comentário de outro → rejeitado
3. Post publicado → push chega num device físico; rodar o job de novo **não** manda
   segundo aviso
4. Post agendado para 5 min à frente: antes da hora não aparece para assinante nenhum
   (confira na CVR, não na tela); depois do job, aparece
5. `bun check types` limpo; `bun test:unit` cobrindo a idempotência do aviso e a permission
   nova de moderação

## Não é desta fase

- Bloquear/silenciar usuário. `settings/blocked-users.tsx` é rota órfã em inglês do
  Takeout: **ou** vira feature aqui, **ou** é apagada na Fase 17. Não fica como está
- Busca no feed e nos cursos
- Métricas de audiência (quem viu o quê) → Fase 17 decide o que medir
