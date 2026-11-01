# Fase 16 — Operação do criador

**Status:** ⬜ pendente · **Pré-requisito humano:** — (o Firebase foi junto com o aviso
para a [Fase 22](./22-aviso-de-conteudo-novo.md)) · **Depende de:** nada

## Objetivo

O criador publica e não tem como moderar nem programar. São lacunas que aparecem no dia 2
de uso, não no dia 1. (A terceira — avisar — virou a
[Fase 22](./22-aviso-de-conteudo-novo.md), porque aviso de post e de aula são o mesmo
sistema.)

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

### 2. ~~Aviso de post novo~~ → **moveu para a [Fase 22](./22-aviso-de-conteudo-novo.md)**

Não é desta fase mais. O aviso de **post** e o de **aula** viraram um sistema só: mesmo
job de cron, mesma tabela de token, mesma marca de idempotência, mesmo opt-out. Escrever
aqui o de post e depois o de aula noutro lugar seria duplicar as quatro coisas.

A Fase 22 também depende da 19 (matrícula), que é quem diz **quem** recebe aviso de aula —
e isso não existia quando esta fase foi planejada.

Os cuidados continuam valendo e estão lá, com mais detalhe: fan-out fora do caminho do
request, exatamente uma vez por item, o aviso mostra o `teaser` e nunca o `body`, e
preferência por usuário.

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
3. ~~Post publicado → push chega num device físico~~ — é da [Fase 22](./22-aviso-de-conteudo-novo.md)
4. Post agendado para 5 min à frente: antes da hora não aparece para assinante nenhum
   (confira na CVR, não na tela); depois do job, aparece
5. `bun check types` limpo; `bun test:unit` cobrindo a idempotência do aviso e a permission
   nova de moderação

## Não é desta fase

- Bloquear/silenciar usuário. `settings/blocked-users.tsx` é rota órfã em inglês do
  Takeout: **ou** vira feature aqui, **ou** é apagada na Fase 17. Não fica como está
- Busca no feed e nos cursos
- Métricas de audiência (quem viu o quê) → Fase 17 decide o que medir
