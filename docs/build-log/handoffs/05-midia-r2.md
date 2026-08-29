# Fase 5 — Mídia (R2)

## Objetivo

Upload de foto/vídeo/áudio direto para o Cloudflare R2 e uma rota de playback que refaz o
gate de assinatura **com o tier** antes de assinar a URL — fechando o buraco que a Fase 4
deixou de propósito em `canAccessMedia`.

## Feito

### Configuração

- [`package.json`](../../../package.json) — bloco `"env"` ganhou
  `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ACCESS_KEY`,
  `CLOUDFLARE_R2_SECRET_KEY`, todas com default `""`. Dependências novas:
  `expo-video@~55.0.11` e `expo-audio@~55.0.9` (versões tiradas de
  `node_modules/expo/bundledNativeModules.json`, que é a tabela de compatibilidade do
  próprio SDK 55).
- [`src/server/env-server.ts`](../../../src/server/env-server.ts) e
  [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) — as quatro linhas
  correspondentes, escritas à mão **no formato exato** que o `bun env:update` gera, para
  o comando continuar sendo no-op.
- [`.env.local.example`](../../../.env.local.example) — modelo comentado, com a política
  de CORS que o bucket precisa.
- [`.env.development`](../../../.env.development) — só um aviso de onde as credenciais
  moram. Nenhum segredo: este arquivo **não** é gitignored.

### Servidor

- [`src/constants/media.ts`](../../../src/constants/media.ts) — isomórfico: allowlist de
  mime, limites por `kind` (foto 25 MB · áudio 200 MB · vídeo 1 GB), extensão por mime,
  TTLs.
- [`src/server/storage/r2.ts`](../../../src/server/storage/r2.ts) — SigV4 por query
  string, escrito à mão sobre `node:crypto`. `isR2Configured()`,
  `getSignedUploadUrl()`, `getSignedPlaybackUrl()`, `headObject()`, `buildStorageKey()`.
- [`src/server/media/mediaAccess.ts`](../../../src/server/media/mediaAccess.ts) —
  `resolveMediaAccess()` (o paywall dos bytes) e `canUploadMedia()`.

### Rotas

| Rota | Método | O que faz |
|---|---|---|
| [`app/api/media/upload-url+api.ts`](../../../app/api/media/upload-url+api.ts) | POST | valida, cria `media` com `status: 'pending'`, devolve PUT assinado |
| [`app/api/media/complete+api.ts`](../../../app/api/media/complete+api.ts) | POST | `HEAD` no bucket e só então `status: 'ready'` |
| [`app/api/media/[id]/play+api.ts`](../../../app/api/media/[id]/play+api.ts) | GET | o paywall: 302 para a URL assinada, ou **403** |

### Cliente

- [`src/features/media/mediaApi.ts`](../../../src/features/media/mediaApi.ts) — `fetch`
  com cookie (web) e Bearer (nativo), erro tipado com `status` e `code`.
- [`src/features/media/playback.ts`](../../../src/features/media/playback.ts) —
  `mediaPlaybackUrl()`, `fetchSignedPlayback()`, `useSignedPlayback()`.
- [`src/features/media/useMediaUpload.ts`](../../../src/features/media/useMediaUpload.ts)
  — hook de upload com progresso (XHR).
- [`src/features/media/MediaFrame.tsx`](../../../src/features/media/MediaFrame.tsx) —
  moldura, estados e `MediaViewMedia`/`MediaViewProps`, compartilhados pelas duas
  plataformas.
- [`src/features/media/MediaView.tsx`](../../../src/features/media/MediaView.tsx) (web) e
  [`MediaView.native.tsx`](../../../src/features/media/MediaView.native.tsx) (iOS/Android).
- [`src/interface/icons/PlayIcon.tsx`](../../../src/interface/icons/PlayIcon.tsx) e
  [`PauseIcon.tsx`](../../../src/interface/icons/PauseIcon.tsx) — o player de áudio
  nativo precisa de controles próprios; não havia esses ícones.

### Verificação

- [`scripts/media-smoke.ts`](../../../scripts/media-smoke.ts) — faz o fluxo inteiro sem
  UI: login, assinar, PUT no R2, confirmar, playback. Modo `--check` só testa o playback
  com outra conta, que é o teste do 403.

### Editado fora do escopo estrito

- [`src/features/feed/PostCard.tsx`](../../../src/features/feed/PostCard.tsx) — o
  `MediaSlot` tinha um placeholder escrito "mídia entra na Fase 5". Agora renderiza
  `<MediaView>` de verdade; o placeholder sobrou só para post sem linha de `media`.

## Decisões

**1. Presign escrito à mão, sem `@aws-sdk/client-s3`.** São ~120 linhas de HMAC contra
dezenas de MB de dependência. Nenhum byte de mídia passa pelo servidor do app — quem
sobe e quem baixa é o cliente, direto no bucket —, então o SDK só traria peso.

**2. Upload é do criador OU do admin, não só do admin.** O plano dizia "exige
`ensureAdmin`". Mas o criador semeado pelas migrations tem `role = 'user'`
(`migrations/20260204022039_demo_user.ts`) e o `ADMIN_WHITELIST` vem com e-mails de
exemplo — exigir admin travaria a própria validação desta fase. `canUploadMedia()` aceita
`getIsAdmin(auth) || auth.id === MASTER_USER_ID`. Quando a Fase 8 tiver admin de verdade,
promover o criador a `role = 'admin'` e apagar a segunda condição é seguro.

**3. Quem marca `ready` é o servidor, depois de um `HEAD` no bucket.** O plano dizia
"cliente sobe e depois marca ready". Duas razões para não fazer assim: o cliente poderia
marcar mídia que nunca subiu, e a linha nasce no servidor — um `update` otimista do Zero
correria contra o próprio sync. `/api/media/complete` faz `HEAD`, lê o tamanho real e
grava. Sem corrida e com prova.

**4. `storageKey` é decidida no servidor.** `media/<ownerId>/<ano>/<mês>/<id>.<ext>`.
Nome de arquivo do usuário nunca vira segmento de path; a extensão sai da allowlist de
mime. Se a chave viesse do cliente, quem alcançasse a rota escolheria onde escrever
dentro do bucket.

**5. O `Content-Type` entra na assinatura do PUT.** Sem isso o cliente subiria qualquer
coisa na chave que acabamos de autorizar. Efeito colateral: o `Content-Type` do PUT tem
que ser byte a byte igual ao assinado — é a causa nº 1 de 403 vindo do R2. Por isso a
rota devolve `upload.headers` prontos e o hook os repassa sem tocar.

**6. TTL da URL assinada é diferente por tipo — e não há renovação por timer.**
Foto e poster: 5 min (o plano). **Vídeo e áudio: 4 horas.** O motivo é concreto: o player
não faz uma requisição só, ele pede faixas (`Range`) durante a reprodução inteira e cada
uma revalida a assinatura — com 5 min, um seek aos 6 minutos de aula quebraria. E renovar
por timer não resolve, porque trocar o `src` no meio **reinicia o vídeo**. A saída é TTL
longo + `reload()` no `onError` do player: renova quando falha, não a cada N minutos
(com teto de 2 tentativas, senão mídia quebrada vira laço).

**7. Foto na web vai direto na rota; vídeo/áudio passam pelo JSON.** Na web o cookie de
sessão viaja sozinho, então `<img src="/api/media/<id>/play">` custa zero round-trip de
JS — importa num feed com 20 fotos. Vídeo e áudio usam `?format=json` porque aí temos o
**código** do erro (403 `needs-plan`) em vez de um `onError` mudo, e o player recebe a URL
do R2 já resolvida, o que é melhor para `Range`/seek. **No nativo tudo passa pelo JSON**:
lá a sessão é Bearer e nem `<Image>` nem player aceitam cabeçalho de autorização.

**8. O gate da rota de playback percorre os três caminhos de anexo.** `postMedia → post`,
`lesson.mediaId → lesson + course` e `course.coverMediaId → course`. Libera se **qualquer
um** liberar (a mesma foto pode estar num post aberto e num curso pago) e a regra de cada
um copia `postGate`/`courseGate` — com uma diferença: aqui `requiredPlanId` é obrigatório.
**Mídia órfã**, sem nenhum conteúdo publicado apontando para ela, é negada para quem não
é dono. O default fecha, não abre (decisão 8 do `STATE`).

**9. Sem `expo-file-system` no upload.** O hook usa `XMLHttpRequest`, que existe nas duas
plataformas e é o único jeito de ter `upload.onprogress`. Ele recebe um `Blob` — quem
escolhe o arquivo é a tela. Ver "Não feito".

## Comandos pro usuário rodar

De `/mnt/f/apps/bubble-app/mobile-bubble-app`, no WSL.

### 1. Dependências novas

```bash
bun install
```
→ instala `expo-video` e `expo-audio`. **Só o nativo usa essas duas**: o `MediaView` da
web não as importa, então se o build nativo der problema, a web continua inteira.

### 2. Credenciais do R2

```bash
cp .env.local.example .env.local
```
→ preencher as quatro chaves. `.env.local` é gitignored e é lido pelo `bun dev`.
⚠️ **Não** é lido por `bun migrate` / `bun run:dev` / `bun test` (esses rodam
`dotenvx run -f .env .env.development`). Nenhum deles precisa do R2.

No painel do Cloudflare, em **R2 → Settings → CORS Policy** do bucket:

```json
[
  {
    "AllowedOrigins": ["http://localhost:8081"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

O bucket continua **privado** — nada de "Public bucket" nem domínio público.

### 3. Checagens

```bash
bun check types
```
→ tem que sair limpo. Rodado depois do `bun install`: **zero erros**, incluindo
`MediaView.native.tsx` contra as APIs reais do `expo-video`/`expo-audio`.

> Correção que saiu daí: `VideoView` nesta versão não tem `allowsFullscreen` — virou
> `fullscreenOptions={{ enable: true }}`.

```bash
bun env:update
```
→ esperado: **"All files up to date"**. Se ele alterar algo, meu `env-server.ts` /
`ci.yml` escritos à mão divergiram do gerador — me mande o diff.

### 4. Subir

```bash
bun backend
```
→ **Nenhuma migration nova e nenhuma tabela nova nesta fase.** O conjunto de tabelas
publicadas não mudou, então **o replica do zero-cache NÃO precisa ser reconstruído** —
esqueça o `backend:clean` desta vez.

```bash
bun dev
```
→ **reinicie mesmo que já esteja no ar.** As rotas de `app/api/media/` são novas e o
scanner de rotas do One não pega arquivo criado com o servidor rodando (o file watching
não funciona em `/mnt/f`, ver `STATE`). Se ainda der 404 nas rotas, apague
`node_modules/.vite` e `node_modules/.vite-temp` e suba de novo.

### 5. Upload ponta a ponta

```bash
bun scripts/media-smoke.ts ./caminho/para/foto.jpg
```
→ esperado, em ordem: `autenticado como demo@...`, `assinado — storageKey: media/...`,
`objeto gravado (200)`, `mídia pronta`, `302 para a URL assinada`. No fim ele imprime o
`mediaId` — guarde.

Se o PUT vier **403**, é credencial errada ou CORS do bucket. Se vier **503**
`r2-not-configured`, o `.env.local` não foi lido: reinicie o `bun dev`.

### 6. O teste do paywall — ✅ EXECUTADO EM 2026-08-29, PASSOU

Resultado: sem assinatura → **403 `needs-subscription`** · Mensal (plano errado) →
**403 `needs-plan`** · Anual → **302**. O roteiro abaixo é o que foi rodado.

⚠️ **Confira os ids antes**: o banco foi resemeado depois da Fase 4 e os posts
`post-aberto`/`post-assinante`/`post-anual` que o `STATE` citava **não existem mais**.

```bash
docker compose exec pgdb psql -U user -d postgres -c 'SELECT id, kind, visibility, "requiredPlanId" FROM post ORDER BY id'
```

Seed atual (2026-08-29): `p-anuncio` (video, subscribers) · `p-cac` (text, **exige
`plan-anual`**) · `p-funil` (photo, subscribers) · `p-landing` e `p-preco` (public).
Planos: `plan-mensal`, `plan-anual`. Cobaia: `teste@bubble.local` / `teste123456`,
id `test-user-b`.

Prenda a mídia recém-subida ao post que **exige o plano Anual** (`p-cac`). Ele é de
texto, mas isso não importa: o gate lê `post.requiredPlanId`, não `post.kind`.

```bash
docker compose exec pgdb psql -U user -d postgres -c "INSERT INTO \"postMedia\" (id, \"postId\", \"mediaId\", position) VALUES ('pm-smoke', 'p-cac', '<mediaId>', 0) ON CONFLICT (id) DO UPDATE SET \"mediaId\" = EXCLUDED.\"mediaId\""
```

**(a) sem assinatura nenhuma → 403**

```bash
bun scripts/media-smoke.ts --check <mediaId> --email teste@bubble.local --password teste123456 --expect 403
```

**(b) assinando o plano ERRADO (Mensal) → ainda 403.** É esta linha que prova que a rota
checa o tier, e não só "tem assinatura":

```bash
docker compose exec pgdb psql -U user -d postgres -c "INSERT INTO subscription (id, \"userId\", \"creatorId\", \"planId\", status) VALUES ('sub-smoke', 'test-user-b', 'demo-user-id', 'plan-mensal', 'active') ON CONFLICT (id) DO UPDATE SET \"planId\" = 'plan-mensal', status = 'active'"
```

```bash
bun scripts/media-smoke.ts --check <mediaId> --email teste@bubble.local --password teste123456 --expect 403
```

**(c) trocando para o plano certo (Anual) → 302**

```bash
docker compose exec pgdb psql -U user -d postgres -c "UPDATE subscription SET \"planId\" = 'plan-anual' WHERE id = 'sub-smoke'"
```

```bash
bun scripts/media-smoke.ts --check <mediaId> --email teste@bubble.local --password teste123456 --expect 302
```

Se (b) devolver 302, o gate de tier está furado — é o cenário exato que esta fase existe
para impedir.

Limpeza depois:

```bash
docker compose exec pgdb psql -U user -d postgres -c "DELETE FROM subscription WHERE id = 'sub-smoke'; DELETE FROM \"postMedia\" WHERE id = 'pm-smoke'"
```

### 7. Na tela

⚠️ **Mídia recém-subida não aparece em lugar nenhum sozinha.** O upload só cria a linha
em `media`; ela fica órfã até entrar em `postMedia`, `lesson.mediaId` ou
`course.coverMediaId`. Órfã, ela é negada até para assinante (só o dono e o admin veem) —
é a regra "o default fecha" aplicada a mídia sem conteúdo.

Para ver a foto no feed, prenda-a ao post de foto (`p-funil`):

```bash
docker compose exec pgdb psql -U user -d postgres -c "INSERT INTO \"postMedia\" (id, \"postId\", \"mediaId\", position) VALUES ('pm-funil', 'p-funil', '<mediaId>', 0)"
```

Abra `http://localhost:8081` — o `PostCard` mostra a imagem, sem o placeholder.

⚠️ Use `http://localhost:8081`, não o IP de rede: `trustedOrigins` derruba o login pelo IP
(ver `STATE`).

## Não feito

- **Nenhum seletor de arquivo.** `useMediaUpload` recebe um `Blob` — quem escolhe o
  arquivo é a tela, e a tela de composição é da **Fase 8 (Admin)**. Na web é um
  `<input type="file">`. No nativo falta `expo-image-picker` (`~55.0.14`, mesma tabela de
  compatibilidade), que **não instalei** porque escolher arquivo não é escopo desta fase.
- **Upload nativo de arquivo grande carrega tudo em memória.** Para mandar bytes de um
  `file://` pelo XHR é preciso `fetch(uri).blob()`. Serve para foto; para vídeo de
  centenas de MB o certo é `expo-file-system` com upload em streaming. Decidir na Fase 8,
  junto com o seletor.
- **Sem multipart upload.** Um PUT único por arquivo. Daí o limite de 1 GB para vídeo,
  bem abaixo do teto de `int4` de `sizeBytes` (~2,1 GB).
- **Sem transcoding, sem HLS, sem bitrate adaptativo** — decisão 5 do `STATE`, mantida.
  `media.provider` existe para migrar para Stream/Mux depois.
- **Poster não é gerado automaticamente.** A rota aceita e serve `posterKey`
  (`?variant=poster`), e o hook sobe o poster se você passar o `Blob`, mas ninguém extrai
  o frame do vídeo. `expo-video-thumbnails` (`~55.0.11`) resolveria no nativo; na web dá
  para tirar de um `<canvas>`. Fase 8.
- **Picture-in-Picture está desligado no vídeo nativo.** Ligar `allowsPictureInPicture`
  exige o config plugin do `expo-video` com `supportsPictureInPicture`, que acrescenta o
  background mode `audio` ao `Info.plist` — hoje `app.config.ts` só declara `fetch` e
  `remote-notification`. Fullscreen está ligado (`fullscreenOptions={{ enable: true }}`).
- **Sem teste automatizado.** `scripts/media-smoke.ts` é manual. Um Playwright do fluxo de
  upload precisaria de bucket de teste — não estava no plano.
- **`CLOUDFLARE_R2_PUBLIC_URL`** (citada em `scripts/helpers/env-load.ts`) ficou de fora
  de propósito: ela só serve para bucket público, e aqui todo acesso é por URL assinada.

## Contrato pro próximo

### Mostrar mídia

```tsx
import { MediaView } from '~/features/media/MediaView'
import type { MediaViewMedia } from '~/features/media/MediaFrame'

<MediaView media={row} alt="descrição" />
```

`row` é a linha de `media` que já vem das queries da Fase 4 —
`post.media[].media`, `lesson.media`, `course.coverMedia`. Nada a buscar a mais.
`enabled={false}` segura a requisição em lista virtualizada.

O `<MediaView>` resolve `photo`/`video`/`audio` sozinho e já trata os estados de
carregando, sem acesso e erro. **Nunca monte URL de R2 na tela** — o `storageKey` que
chega pelo sync não abre arquivo nenhum.

### Subir mídia

```tsx
import { useMediaUpload } from '~/features/media/useMediaUpload'

const { upload, progress, phase, isUploading, error, cancel } = useMediaUpload()

const mediaId = await upload({ blob: file, mime: file.type })
// mediaId != null  =>  `media` já está com status 'ready' no banco
```

Depois disso, prender ao conteúdo é uma mutation normal do Zero:

```ts
zero.mutate.postMedia.insert({ id: newId(), postId, mediaId, position: 0 })
// ou lesson.mediaId / course.coverMediaId
```

`phase`: `idle → signing → uploading → finishing → done` (ou `error`).
`progress` vai de 0 a 1.

### Rotas

| Rota | Códigos |
|---|---|
| `POST /api/media/upload-url` | 200 · 400 · 401 · 403 · 409 · 413 · 503 |
| `POST /api/media/complete` | 200 · 401 · 403 · 404 · 422 `object-missing` · 503 |
| `GET /api/media/[id]/play` | 302 · 401 · 403 · 404 · 409 `not-ready` · 503 |

O corpo de erro é sempre `{ error, code }`. Os `code` que a UI precisa distinguir:
`needs-subscription` (não assina) e `needs-plan` (assina, mas outro plano) —
`MediaMessage` em `MediaFrame.tsx` já mapeia os dois.

### Limites (de `~/constants/media`)

`MAX_UPLOAD_BYTES` · `ALLOWED_MIME` · `kindForMime()` · `formatBytes()`.
Foto 25 MB · áudio 200 MB · vídeo 1 GB. Valide na tela **e** confie na rota: ela valida
de novo.

### O que ainda depende de decisão humana

1. **Promover o criador a `role = 'admin'`?** Hoje `canUploadMedia()` tem uma segunda
   condição só por causa disso (decisão 2). Um `UPDATE "user" SET role = 'admin'` no
   criador deixaria o código mais simples e a Fase 8 mais direta.
2. **Seletor de arquivo no nativo** — instalar `expo-image-picker` na Fase 8.
