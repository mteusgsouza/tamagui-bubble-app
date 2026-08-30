# Fase 8 — Admin (web-only, mesmo projeto)

**Status:** ⬜ pendente · **Pré-requisito humano:** —

## Escopo

`app/(app)/admin/` com layout que redireciona quem não é admin. A checagem já existe:
`src/server/getIsAdmin.ts` (`getIsAdmin` / `ensureAdmin`) + `role` em `AuthData`.
Padrão de guard: o de `app/(app)/_layout.tsx`.

Telas:
- Composer de post (upload + agendamento) — ver **[Fase 5]** logo abaixo
- CRUD de cursos / módulos / aulas
- Lista de usuários — banir e promover via plugin `admin` do Better Auth
- Assinaturas
- Faturamento, lendo `payment` por **server action** (`src/data/server/actions/`), já que
  `payment` é tabela privada e não passa pelo Zero

## [Fase 5] O que o composer herda — e o que a Fase 5 deixou para cá

A camada de mídia está pronta e o composer só precisa consumi-la:

```tsx
import { useMediaUpload } from '~/features/media/useMediaUpload'

const { upload, progress, phase, isUploading, error, cancel } = useMediaUpload()
const mediaId = await upload({ blob: file, mime: file.type })
zero.mutate.postMedia.insert({ id: newId(), postId, mediaId, position: 0 })
```

Contrato completo em [`../handoffs/05-midia-r2.md`](../handoffs/05-midia-r2.md).

**Três coisas ficaram explicitamente para esta fase:**

1. **Seletor de arquivo.** `useMediaUpload` recebe um `Blob` — ninguém escolhe o arquivo.
   Na web é `<input type="file">`. No nativo falta instalar `expo-image-picker`
   (`~55.0.14`, versão da tabela em `node_modules/expo/bundledNativeModules.json`).
2. **Upload nativo de arquivo grande.** O hook usa XHR, e mandar bytes de um `file://`
   exige `fetch(uri).blob()` — carrega tudo em memória. Serve para foto; vídeo de
   centenas de MB precisa de `expo-file-system` com streaming. Decidir junto com (1).
3. **Poster de vídeo.** A rota já serve `?variant=poster` e o hook sobe o poster se
   receber o `Blob`, mas ninguém extrai o frame. Web: `<canvas>`. Nativo:
   `expo-video-thumbnails` (`~55.0.11`).

**[Fase 7] Escrever curso é mutation do Zero, sem rota de API:**

```ts
zero.mutate.course.insert({ id: newId(), feedOwnerId, slug, title, ... })
zero.mutate.courseModule.insert({ id: newId(), courseId, title, order })
zero.mutate.lesson.insert({ id: newId(), courseId, moduleId, title, order, published, freePreview })
```

⚠️ **`lesson.order` é global no curso, não por módulo.** O currículo agrupa por
`moduleId`, mas a numeração ("AULA 3 DE 24") e a "próxima aula" seguem `order`. Se o
admin permitir reordenar, tem que preservar isso — `lessonPosition` e `lessonAfter` em
`~/features/courses/courseStats` dependem dele.

`scripts/seed-courses.ts` é um exemplo executável dessa estrutura.

**Sobre o guard de admin:** `canUploadMedia()` (em `src/server/media/mediaAccess.ts`)
aceita `admin` **ou** `MASTER_USER_ID`, porque o criador semeado tem `role = 'user'`. Se
esta fase promover o criador a `role = 'admin'`, a segunda condição pode sair.

## Web-only por escolha

Não vale carregar o admin no bundle nativo. Se um dia crescer a ponto de justificar
deploy próprio, é aí que o repo vira workspaces e o admin sai como `apps/admin` — não
antes.

## Cuidado

O JWT dura 3 anos (`src/features/auth/server/authServer.ts:50`), então promover alguém a
admin **não tem efeito até o token renovar**. Para a tela de usuários funcionar de
verdade, a checagem de admin provavelmente precisa ler o banco, não a claim. Verificar
se o plugin `admin` do Better Auth já contorna isso.

## Verificação

`bun test:integration` (Playwright) para login como admin → publicar post → ver na lista
de usuários. E o inverso: usuário comum recebe redirect ao tentar `/admin`.
