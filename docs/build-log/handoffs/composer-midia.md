# Handoff — Composer, mídia e contas de teste

> Não é uma fase numerada: é o trabalho que veio de um pedido direto do usuário, entre a
> Fase 17 e a 18. Está comitado em `6616078` e validado no navegador.

## Objetivo

O composer mostra o que vai ser publicado, a foto para de ser cortada no lugar errado, e
o admin funciona no celular.

## Feito

**Dimensão e ponto focal da imagem**

| Arquivo | O quê |
|---|---|
| `src/database/schema-public.ts` | `media.focalX` / `media.focalY` (`real`, `0..1`, default `0.5`) |
| `src/database/migrations/20261101180418_stale_gateway*` | a migration (gerada pelo `migrate:build`, não escrita à mão) |
| `src/constants/media.ts` | `FOCAL_CENTER` — isomórfico, usado pelo servidor e pela tela |
| `src/features/admin/pickedFile.ts` | **novo** — o tipo `PickedFile` e `PickKind`, compartilhado pelos dois seletores |
| `src/features/admin/pickFile.ts` | passa a **medir** antes de subir (`createImageBitmap`, `<img>`/`<video>` de reserva, teto de 5 s) e devolve `PickedFile[]`. `describePicked` é exportada para dar prova no navegador |
| `src/features/media/focalPoint.ts` | **novo**, puro — `focalPosition`, `focalContentPosition`, `mediaRatio`, `postRatio`, `clampFocal` |
| `src/features/media/MediaView.tsx` | `objectPosition` na foto |
| `src/features/media/MediaView.native.tsx` | trocou o `Image` do Tamagui por `expo-image` (`contentPosition`) |
| `src/features/admin/FocalPointEditor.tsx` | **novo** — clique/arrasto sobre a imagem inteira, com o recorte ao vivo em 1:1 e na proporção do post |
| `src/server/content/{adminPosts,posts,courses}.ts` + `dto.ts` | `focalX`/`focalY` no `MediaDTO`, nos três selects de mídia |
| `app/api/admin/posts+api.ts` | ação `setMediaFocal` |

**Prévia do post**

`src/features/admin/postPreview.ts` (**novo**, puro) monta um `FeedPost` do rascunho;
`src/features/feed/PostCard.tsx` ganhou a prop `preview` (desliga navegação e escrita) e
`LikeButton.tsx` a prop `readOnly`. O composer
(`app/(app)/admin/posts/[postId].tsx`) foi reorganizado em duas colunas no `$md`, com
abas Editar/Prévia abaixo disso.

**Admin no celular**

`AdminActionBar` + `ADMIN_ACTION_BAR_HEIGHT` em `src/features/admin/AdminShell.tsx`
(barra fixa embaixo), navegação do admin numa faixa que rola, `px` menor abaixo de `$md`,
grade de fotos em duas colunas, e `label` virou opcional em `fields.tsx` (`OptionRow`
serve de alternador).

**Contas de teste**

`src/constants/devAccounts.ts` (**novo**), `scripts/seed-dev-accounts.ts` (**novo**),
`signInWithPassword` em `src/features/auth/client/signInAsDemo.ts`, e o bloco de atalho em
`app/(app)/auth/login.tsx`.

**Testes**: `src/test/unit/focal-point.test.ts` (16) e `post-preview.test.ts` (12).
**186 testes** no total (eram 158).

**Documentação**: `plan/18` a `plan/22`, `INDEX.md`, `STATE.md`, `plan/00-contexto.md`, e
o item 2 da `plan/16` movido para a 22.

## Decisões (o que não é óbvio lendo o código)

1. **Ponto focal em `media`, não em `postMedia`.** Recorte é propriedade da imagem: a
   mesma linha serve o feed, a grade do composer e a capa de curso. O preço é que ajustar
   uma imagem usada em dois lugares muda nos dois — e a tela diz isso.
2. 🔴 **Uma proporção por post** (`postRatio`, limitada a `4/5…16/9`). Enquanto
   `media.width` era `NULL` em tudo, os slides tinham a mesma altura **por acidente**.
   Gravar a dimensão real criaria pulo de altura a cada swipe; o limite também evita que
   uma 9:16 ocupe uma tela e meia de celular.
3. **`preview` é prop do `PostCard`, não um card novo.** Card imitado diverge do original
   na terceira mudança, e aí a prévia passa a mentir. A prop existe por dois motivos
   concretos: o título vive num `Link` que tiraria o criador do editor, e o `LikeButton`
   escreveria em `reaction` de verdade (quem olha a prévia está logado).
4. **`isDevAccountsEnabled` é `NODE_ENV === 'development'`, mais apertado que
   `isDemoMode`** (que também liga com `VITE_DEMO_MODE=1`). Variável de ambiente não é
   lugar de decidir se senhas aparecem numa tela. Em produção a condição é constante
   `false` e o bloco sai no tree-shaking.
5. **O botão "ajustar" está atrás de `isWeb`.** O `FocalPointEditor` é DOM cru (precisa de
   `setPointerCapture`), e o código do admin entra no bundle nativo mesmo com o redirect.
   Habilitar no nativo é escrever `FocalPointEditor.native.tsx`.
6. **`expo-image` no nativo só por causa do `contentPosition`.** O `Image` do Tamagui
   deriva de `RN.Image` e recorta sempre pelo centro — o ajuste feito no admin não
   apareceria no celular.
7. **A migration do ponto focal foi gerada pelo `bun run migrate:build`**, não escrita à
   mão. O `tko` faz o diff do schema e cria o par `.ts` + pasta com `snapshot.json`; a
   versão manual que eu tinha escrito virou duplicata e foi removida. **Escreva o schema e
   deixe o `migrate:build` gerar** — só backfill vai à mão.

## Comandos pro usuário rodar

Já rodados nesta sessão, em ordem, com o resultado obtido:

| Comando | Resultado esperado |
|---|---|
| `bun run migrate:build` | "✅ Migrations built successfully" |
| `docker compose up migrate --no-deps` | aplica `20261101180418`; `media` ganha `focalX`/`focalY` |
| `bun dev` | sobe em :8081 (**reinicie a cada edição** — watcher não funciona em `/mnt/f`) |
| `bun run:dev scripts/seed-dev-accounts.ts` | cria as 4 contas; Admin com `role=admin`, Assinante com `plan-mensal` |
| `bun check types` | limpo |
| `bun test:unit` | 186 testes |
| `bun check native-bundle` | compila no Hermes |

## Não feito (e por quê)

- 🔴 **Admin no app nativo.** Continua web-only: `pickFile.native.ts` é stub e falta
  `expo-image-picker@~55.0.14` mais build novo. Era a "Etapa 5" do plano original e foi
  deixada de fora por exigir dependência nativa e build.
- **`expo-image` não rodou em aparelho.** O bundle de release compila com Hermes, e só.
- **Foto antiga continua sem `width`/`height`.** A medição vale para upload novo; a mídia
  semeada cai no fallback de 16/9. O ponto focal funciona nela mesmo assim.
- **Capa de curso** recebe o ponto focal pelo mesmo caminho, mas não foi clicada.
- 🔴 **Reembolso continua sem existir em camada nenhuma** — ver "Não é desta fase" da
  [Fase 20](../plan/20-curso-avulso.md).

## Contrato pro próximo (Fase 18)

O que já existe e **não deve ser reescrito**:

| Precisa de | Use |
|---|---|
| escolher arquivo **medido** | `pickFiles(kind, multiple)` → `PickedFile[]` com `width`, `height`, `durationSec` |
| subir (assinar → PUT no R2 → confirmar) | `useMediaUpload().upload(picked)` → `mediaId`; ele já grava dimensão e duração |
| mostrar mídia com recorte correto | `MediaView` + `focalPoint.ts` (`postRatio`, `focalPosition`) |
| barra de ação fixa no celular | `AdminActionBar` / `ADMIN_ACTION_BAR_HEIGHT` (`AdminShell.tsx`) |
| campo, pílulas, moldura de seção | `fields.tsx` (`TextField`, `OptionRow` — `label` é opcional), `AdminSection` |
| entrar como Criador / Admin / Assinante / Visitante | atalho na tela de login + `src/constants/devAccounts.ts` |
| ajustar recorte de uma foto | ação `setMediaFocal` em `/api/admin/posts` |

Tipos novos que o DTO já carrega: `MediaDTO.focalX` e `.focalY` (sempre número — o
servidor faz `?? FOCAL_CENTER` porque `media` entra por `leftJoin`).

⚠️ **Não copie o `PostMediaField`** para a aula. Ele é grade de 9 fotos com fila e tabela
de vínculo; a aula tem uma mídia só, por `lesson.mediaId`. O que é compartilhado já está
extraído (`useMediaUpload`, `pickFiles`).
