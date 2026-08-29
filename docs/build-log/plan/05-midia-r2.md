# Fase 5 — Mídia (R2)

**Status:** ✅ concluída — ver [`../handoffs/05-midia-r2.md`](../handoffs/05-midia-r2.md)
· **Pré-requisito humano:** ⚠️ **conta Cloudflare R2 + credenciais no `.env.local`**

> O handoff registra onde a execução divergiu deste plano e por quê: quem pode subir
> mídia (criador **ou** admin, não só admin), quem marca `status: 'ready'` (o servidor,
> depois de um `HEAD` no bucket) e o TTL da URL assinada de vídeo (4 h, não 5 min).

> **Atualizado pela Fase 4** — ver [`../handoffs/04-camada-zero.md`](../handoffs/04-camada-zero.md).
> As seções marcadas **[Fase 4]** são novas.

## Escopo

O Takeout Free cita as env vars de R2 no README mas **não tem código de upload** — só
`scripts/helpers/env-load.ts` as referencia. É construção do zero.

1. Declarar as env vars no bloco `"env"` do `package.json` (o sistema de env do Takeout
   é code-driven, ver `scripts/helpers/env-load.ts`): `CLOUDFLARE_R2_ENDPOINT`,
   `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY`.
   Valores reais em `.env.local` (gitignored).
2. `src/server/storage/r2.ts` — cliente S3-compatível + `getSignedUploadUrl()` /
   `getSignedPlaybackUrl(key, ttl)`.
3. `app/api/media/upload-url+api.ts` — POST. Exige admin (`ensureAdmin` de
   `src/server/getIsAdmin.ts`, já existe). Cria `media` com `status: 'pending'`, devolve
   PUT assinado. Cliente sobe direto pro R2, depois marca `status: 'ready'`.
4. `app/api/media/[id]/play+api.ts` — GET. **É aqui que o paywall vale de verdade:**
   lê a `subscription` do usuário **direto do Postgres** (leitura fresca, sem cache de
   token) e só então responde 302 pra URL assinada com TTL curto (~5 min). Sem
   assinatura ativa → 403.
5. `src/features/media/` — hook de upload com progresso, `<MediaView>` que resolve
   foto/vídeo/áudio, player.

## Divisão de responsabilidade

Zero/permissions escondem os **metadados**; a rota de playback protege os **bytes**.
As duas camadas são independentes de propósito — não confie só numa.

### [Fase 4] A rota de playback tem que checar o TIER, não só "tem assinatura"

`canAccessMedia` (em `src/data/where/canAccessContent.ts`) é **de propósito** mais
frouxa que o gate do post: quem tem qualquer assinatura ativa ao criador recebe as
linhas de `media` dele, **ignorando `requiredPlanId`**. Ou seja: um assinante do plano
Mensal recebe o `storageKey` da mídia de um curso que exige o Anual.

Isso é aceitável porque `storageKey` sozinho não abre o arquivo — **desde que a rota de
playback feche o buraco**. Então o passo 4 não é "tem assinatura ativa?", é:

1. achar a que `post` ou `lesson` essa mídia pertence (via `postMedia`, ou
   `lesson.mediaId` / `course.coverMediaId`);
2. ler o `requiredPlanId` desse conteúdo (do post, ou do curso da aula);
3. se houver, exigir `subscription.planId = requiredPlanId` **e**
   `status IN ('active','trialing')`, lendo direto do Postgres;
4. respeitar `lesson.freePreview` — aula de amostra toca sem assinatura nenhuma.

Sem o passo 3, o paywall por plano só existe na UI. **É o teste do `curl` que prova.**

### [Fase 4] O que já está pronto para consumir

- `media` tem `status ('pending'|'ready'|'failed')`, `provider ('r2')`, `storageKey`,
  `posterKey`, `mime`, `kind`, `sizeBytes`, `durationSec`, `width`, `height`.
- Escrita de `media` já é permitida só para `ownerId` — a rota de upload roda como
  admin/criador, então não esbarra nisso.
- `sizeBytes` é `int4`: teto de ~2,1 GB por arquivo. O limite de upload da rota deve
  ficar **abaixo** disso.
- Relações prontas: `media.posts` (dois saltos, via `postMedia`), `media.owner`,
  `media.postMedia`, `lesson.media`, `course.coverMedia`.
- `ACTIVE_SUBSCRIPTION_STATUSES` está em `~/constants/creator` — use a mesma lista no
  servidor, para o gate do Zero e o da rota nunca discordarem.

## Limitação aceita

MP4 único, sem HLS nem bitrate adaptativo. Vídeo de curso longo em conexão ruim vai
sofrer. `media.provider` existe justamente pra permitir migrar pra Cloudflare Stream ou
Mux depois sem mexer no schema.

## Verificação

Upload de foto/vídeo/áudio ponta a ponta. E um `curl` na rota de playback com sessão
**sem** assinatura tem que dar **403** — é o teste que prova o paywall.
