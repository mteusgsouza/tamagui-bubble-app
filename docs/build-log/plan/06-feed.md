# Fase 6 — Feed

**Status:** ✅ concluída — ver [`../handoffs/06-feed.md`](../handoffs/06-feed.md)
· **Pré-requisito humano:** — · Fase pesada.

> **Atualizado pela Fase 5.** As seções marcadas **[Fase 5]** são novas ou foram
> corrigidas.

## [Fase 5] Parte desta fase JÁ EXISTE — leia antes de escrever

Feito fora do fluxo de agentes, já no repositório:

- `src/tamagui/brandAccent.ts` + `src/tamagui/tamagui.config.ts` — **a rampa de acento já
  está definida.** O "primeiro passo obrigatório" abaixo está **feito**; não refaça.
- `app/(app)/home/(tabs)/feed/index.tsx` — já consome `feedPosts` com `useAuth`, com
  estados de vazio/carregando, **em português**.
- `src/features/feed/PostCard.tsx` — card do post; o `MediaSlot` dele foi ligado ao
  `<MediaView>` pela Fase 5.
- `docs/design/` — mock das 8 telas (`*.dc.html`).

O que **falta** de fato: detalhe do post (`[postId].tsx`), `PostMediaCarousel`,
`CommentList`, `LikeButton`, paginação com `feedPostsPage`.

## Escopo

`app/(app)/home/(tabs)/feed/` — lista (`index.tsx`, **já existe**), detalhe
(`[postId].tsx`).

Componentes em `src/features/feed/`: `PostCard` (**já existe**), `PostMediaCarousel`,
`CommentList`, `LikeButton`.

## [Fase 5] Mídia: já resolvida, não reimplemente

```tsx
import { MediaView } from '~/features/media/MediaView'

<MediaView media={post.media[0].media} />
```

Resolve foto/vídeo/áudio, web e nativo, com os estados de carregando/sem-acesso/erro.
**Nunca monte URL de R2 na tela**: o `storageKey` que chega pelo sync não abre arquivo.
Em lista virtualizada, passe `enabled={false}` até o item entrar em viewport.

Para o `PostMediaCarousel`, `post.media` já vem ordenado por `position` da query — cada
slide é um `<MediaView>`.

Contrato completo (upload, códigos de erro, limites) em
[`../handoffs/05-midia-r2.md`](../handoffs/05-midia-r2.md).

Reaproveitar `src/interface/` (Button, Input, PageContainer, headings, avatars, Toast,
Dialog) em vez de importar Tamagui direto — regra do próprio README do Takeout.

## Anti-patterns a evitar (documentados em `docs/zero.md`)

- `useAuth()`, **não** `useUser()`, para pegar `id`/`role` — `useUser()` consulta o banco
  e cria waterfall.
- Nada de query por item dentro de lista (N+1). Traga o autor via `.related()`.
- Nada de filtro client-side do que devia ser permission server-side.

## Primeiro passo obrigatório: o token de cor primária — ✅ **[Fase 5] já feito**

A rampa de acento já está em `src/tamagui/brandAccent.ts` e ligada na
`src/tamagui/tamagui.config.ts`. A regra abaixo continua valendo para todo componente
novo:

Nenhum componente pode ter hex de acento inline. Se faltar um tom, o certo é criar o
token, não o hex. Cores semânticas (sucesso/erro/aviso) ficam de fora: são independentes
do acento e não mudam quando a marca mudar.

Referência visual: `docs/design/` (mock das 8 telas) — mas **os hex de lá são mock**, não
copiar pra dentro de componente.

## Decisão pendente: idioma da UI

Todo o texto do Takeout está em inglês. O produto é para público brasileiro.
**Decidir aqui** entre traduzir tudo ou adotar i18n — e aplicar de forma consistente, não
meio a meio.

**[Fase 5]** O fato consumado: a tela do feed, o `PostCard` e as mensagens do
`<MediaView>` (`src/features/media/MediaFrame.tsx`) já estão **em português, com texto
literal**. Adotar i18n significa passar por esses arquivos também. A parte do Takeout
(auth, settings) continua em inglês — é aí que está o "meio a meio" a resolver.

## Verificação

`bun test:unit` (Vitest) para queries/mutations; `bun test:integration` (Playwright)
para o fluxo login → feed → post.
