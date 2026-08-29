# Fase 7 — Cursos

**Status:** ⬜ pendente · **Pré-requisito humano:** —

## Escopo

Nova aba no tab bar — mexer em `app/(app)/home/(tabs)/_layout.tsx` **e** no
`_layout.native.tsx` (são dois arquivos, o nativo usa `react-native-bottom-tabs`).

Rotas: lista de cursos → `[courseSlug]` (currículo agrupado por módulo) → `[lessonId]`
(player + `lessonProgress` gravado com debounce).

Feature em `src/features/courses/`.

## [Fase 6] O que já está pronto — não reimplemente

```tsx
import { PostMediaCarousel } from '~/features/feed/PostMediaCarousel'
import { MediaView } from '~/features/media/MediaView'
import { CreatorBadge } from '~/features/feed/CreatorBadge'
import { timeAgo, fullDate, plural } from '~/features/feed/formatDate'
```

- **Player de aula**: `<MediaView media={lesson.media} />` já resolve vídeo e áudio nas
  duas plataformas, com os estados de carregando/sem-acesso/erro. Capa de curso idem.
- **Carrossel**: `PostMediaCarousel` recebe `readonly MediaViewMedia[]` e serve sem
  mudança.
- **Padrão de tela** (lista, loading, vazio) em
  `app/(app)/home/(tabs)/feed/index.tsx`; **rota dinâmica** em `feed/[postId].tsx`.
  Copie a forma: `useAuth` (nunca `useUser`), `status?.type === 'complete'` para separar
  "vazio" de "sincronizando".
- **Rota nova exige reiniciar o `bun dev`** para o One regenerar `app/routes.d.ts` —
  sem isso o `Href` tipado recusa o link e o typecheck quebra.

## [Fase 6] Duas decisões que valem para cá

1. **`newId()` e `Date.now()` só na tela**, nunca dentro da mutation — vale para
   `lessonProgress.save` igual valeu para `reaction.toggle`.
2. **Idioma**: tudo que as Fases 5 e 6 escreveram é português literal, sem i18n. A
   decisão de verdade continua aberta e encarece a cada fase — ver `STATE.md`.

## Cuidados

- `lesson.freePreview` faz bypass do gate de acesso — a aula marcada assim aparece pra
  quem não tem assinatura. Isso vale tanto na permission (Fase 4) quanto na rota de
  playback (Fase 5); confira que as duas concordam.
- Gravar progresso com debounce, não a cada segundo de vídeo: cada mutation do Zero é
  uma escrita sincronizada.

## Verificação

`bun test:unit` + `bun test:integration` para o fluxo login → curso → aula →
progresso persistido após reload.
