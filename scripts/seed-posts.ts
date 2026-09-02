#!/usr/bin/env bun

/**
 * @description Semeia os 5 posts do feed. Fecha a lacuna que o `seed-courses.ts` avisava.
 *
 *   bun run:dev scripts/seed-posts.ts                    # no banco local
 *   VITE_MASTER_USER_ID=<id> ZERO_UPSTREAM_DB=<url do Neon> bun scripts/seed-posts.ts
 *
 * Idempotente: `ON CONFLICT DO NOTHING` em tudo. Rodar duas vezes não duplica, e rodar
 * depois de `bun backend:clean` recria.
 *
 * ⚠️ **O dono vem de `VITE_MASTER_USER_ID`**, não está gravado aqui. Foi por isso que
 * este script existe: os posts nasceram à mão em desenvolvimento com `feedOwnerId =
 * demo-user-id`, e copiar as linhas para produção deixaria o feed vazio — lá o criador é
 * outra conta. A tela lê `feedOwnerId = MASTER_USER_ID`, que é constante de build.
 *
 * ⚠️ **A foto do `p-funil` depende de um objeto que já esteja no bucket R2.** A linha de
 * `media` guarda uma `storageKey`, não os bytes. A chave tem `demo-user-id` no caminho e
 * isso está certo: o caminho é decidido no upload (`app/api/media/upload-url+api.ts`) e
 * nunca mais revalidado — `play+api.ts` serve o que estiver na coluna. Se o objeto não
 * existir no bucket, o post aparece sem a imagem, e o resto do feed não é afetado.
 */

import { Pool } from 'pg'

const CREATOR = process.env.VITE_MASTER_USER_ID || 'demo-user-id'
const DB = process.env.ZERO_UPSTREAM_DB

if (!DB) {
  console.error('❌ ZERO_UPSTREAM_DB não está no ambiente.')
  console.error('   Local:     bun run:dev scripts/seed-posts.ts')
  console.error('   Produção:  VITE_MASTER_USER_ID=<id> ZERO_UPSTREAM_DB=<url> bun scripts/seed-posts.ts')
  process.exit(1)
}

const pool = new Pool({ connectionString: DB })

type PostSeed = {
  id: string
  kind: 'text' | 'photo' | 'video' | 'audio'
  title: string
  body: string
  visibility: 'public' | 'subscribers'
  requiredPlanId?: string
  /** dias atrás; o feed ordena por isto e assim nasce sempre recente */
  daysAgo: number
  /**
   * Curtidas de vitrine. Sobrevivem porque nenhuma tela lista quem curtiu — o número
   * sozinho não se contradiz, e reagir de verdade continua somando em cima.
   *
   * ⚠️ Não existe `commentCount` aqui de propósito. Semear o contador sem semear as
   * linhas de `comment` faz o post anunciar "6 comentários" e a lista responder
   * "Ninguém comentou ainda" — foi o que apareceu na primeira ida a produção.
   */
  likeCount: number
}

const POSTS: PostSeed[] = [
  {
    id: 'p-cac',
    kind: 'text',
    title: 'A planilha de CAC e LTV que eu abro em toda primeira reunião',
    body:
      'Três abas: aquisição, retenção e a conta que ninguém quer fazer.\n\n' +
      'Se o seu CAC paga em mais de 4 meses, o problema não é o anúncio.',
    visibility: 'subscribers',
    // o único que exige plano específico — é ele que prova o join de duas colunas
    requiredPlanId: 'plan-anual',
    daysAgo: 7,
    likeCount: 72,
  },
  {
    id: 'p-preco',
    kind: 'audio',
    title: 'O erro de precificação que quase me quebrou em 2019',
    body: 'Áudio curto. Cobrar por hora foi a decisão mais cara que já tomei.',
    visibility: 'public',
    daysAgo: 6,
    likeCount: 94,
  },
  {
    id: 'p-anuncio',
    kind: 'video',
    title: 'Análise ao vivo: por que esse anúncio queimou R$ 6.400 em 11 dias',
    body: 'Peguei a conta de um aluno e abri o gerenciador junto com ele.',
    visibility: 'subscribers',
    daysAgo: 5,
    likeCount: 206,
  },
  {
    id: 'p-funil',
    kind: 'photo',
    title: 'O funil que levou a Metrix de R$ 8k para R$ 47k/mês em 90 dias',
    body: 'Três slides: diagnóstico, oferta e o follow-up que quase ninguém faz.',
    visibility: 'subscribers',
    daysAgo: 4,
    likeCount: 342,
  },
  {
    id: 'p-landing',
    kind: 'text',
    title: 'Sua landing converte 1,2% porque ela responde à pergunta errada',
    body:
      'Todo mundo fica trocando a cor do botão. Ninguém pergunta o que a pessoa ' +
      'precisa saber antes de clicar.\n\n' +
      'Ontem reescrevi só o primeiro parágrafo de uma página e a taxa de reunião ' +
      'agendada saiu de 2,1% para 7,5%.',
    visibility: 'public',
    daysAgo: 3,
    likeCount: 129,
  },
]

/** A única mídia real do conjunto: os posts de áudio e vídeo são casca, sem arquivo. */
const PHOTO = {
  mediaId: '4735051a-dfa4-4afc-a7f5-ec8cf801a75e',
  postId: 'p-funil',
  storageKey: 'media/demo-user-id/2026/08/4735051a-dfa4-4afc-a7f5-ec8cf801a75e.png',
  mime: 'image/png',
  sizeBytes: 30593,
}

async function seed() {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // o criador precisa existir em userPublic — as FKs de conteúdo apontam para lá
    const creator = await client.query('SELECT 1 FROM "userPublic" WHERE id = $1', [CREATOR])
    if (!creator.rowCount) {
      throw new Error(
        `criador "${CREATOR}" não existe em userPublic. ` +
          'Em produção o id só passa a existir depois do primeiro login real.',
      )
    }

    // `p-cac` referencia plan-anual; sem ele o INSERT viola a FK
    const plan = await client.query('SELECT 1 FROM plan WHERE id = $1', ['plan-anual'])
    if (!plan.rowCount) {
      throw new Error('plano "plan-anual" não existe. Rode antes: scripts/seed-courses.ts')
    }

    for (const post of POSTS) {
      const at = new Date(Date.now() - post.daysAgo * 86_400_000)
      await client.query(
        `INSERT INTO post (id, "feedOwnerId", kind, title, body, visibility,
                           "requiredPlanId", published, "publishedAt",
                           "likeCount", deleted, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, false, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          post.id,
          CREATOR,
          post.kind,
          post.title,
          post.body,
          post.visibility,
          post.requiredPlanId ?? null,
          at,
          post.likeCount,
        ],
      )
    }

    await client.query(
      `INSERT INTO media (id, "ownerId", provider, "storageKey", mime, kind,
                          "sizeBytes", status)
       VALUES ($1, $2, 'r2', $3, $4, 'photo', $5, 'ready')
       ON CONFLICT (id) DO NOTHING`,
      [PHOTO.mediaId, CREATOR, PHOTO.storageKey, PHOTO.mime, PHOTO.sizeBytes],
    )

    // `ON CONFLICT` sem alvo, e não `(id)`: além da chave primária existe o índice único
    // `postMedia_postId_mediaId_uidx`, e a linha que já nasceu pelo upload tem um uuid
    // como id. Mirando só em `id` o insert escapava da cláusula e estourava no índice.
    await client.query(
      `INSERT INTO "postMedia" (id, "postId", "mediaId", "position")
       VALUES ($1, $2, $3, 0) ON CONFLICT DO NOTHING`,
      [`pm-${PHOTO.postId}`, PHOTO.postId, PHOTO.mediaId],
    )

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

try {
  await seed()
  const gated = POSTS.filter((p) => p.visibility === 'subscribers').length
  console.info(`✅ ${POSTS.length} posts semeados · criador ${CREATOR}`)
  console.info(`   ${gated} atrás do paywall, ${POSTS.length - gated} públicos`)
} catch (error) {
  console.error('❌ seed falhou:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
