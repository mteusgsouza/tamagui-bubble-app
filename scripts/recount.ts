#!/usr/bin/env bun

/**
 * @description Reconcilia os contadores denormalizados de `post`.
 *
 *   bun run:dev scripts/recount.ts            # confere e corrige `commentCount`
 *   bun run:dev scripts/recount.ts --likes    # também zera `likeCount` na contagem real
 *   bun run:dev scripts/recount.ts --dry-run  # só relata
 *
 * Os dois contadores recebem tratamento diferente, e isso é deliberado.
 *
 * **`commentCount` é recontado.** O número tem que bater com a lista que a tela mostra:
 * post anunciando "6 comentários" sobre uma lista que responde "Ninguém comentou ainda"
 * foi o que apareceu na primeira ida a produção. As escritas já recontam, então aqui a
 * correção só alcança divergência criada por fora (SQL à mão, restore de dump).
 *
 * 🔴 **`likeCount` NÃO é recontado sem `--likes`.** O seed semeia curtidas de vitrine
 * (`p-funil` nasce com 342) e isso se sustenta porque nenhuma tela lista quem curtiu — o
 * número sozinho não se contradiz. Recontar derrubaria 342 para o punhado de linhas reais
 * em `reaction`, que é destruir o conteúdo de demonstração. Por padrão o script só
 * **relata** a diferença.
 */

import { Pool } from 'pg'

const DB = process.env.DATABASE_URL

if (!DB) {
  console.error('❌ DATABASE_URL não está no ambiente.')
  console.error('   Local:  bun run:dev scripts/recount.ts')
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const alsoLikes = args.includes('--likes')

const pool = new Pool({ connectionString: DB })

type Row = {
  id: string
  likeCount: number
  commentCount: number
  realLikes: number
  realComments: number
}

async function main() {
  const { rows } = await pool.query<Row>(`
    SELECT p.id,
           p."likeCount",
           p."commentCount",
           (SELECT count(*)::int FROM reaction r
             WHERE r."postId" = p.id AND r.type = 'like')            AS "realLikes",
           (SELECT count(*)::int FROM comment c
             WHERE c."postId" = p.id AND c.deleted = false)          AS "realComments"
      FROM post p
     ORDER BY p.id
  `)

  const commentDrift = rows.filter((row) => row.commentCount !== row.realComments)
  const likeDrift = rows.filter((row) => row.likeCount !== row.realLikes)

  console.info(`${rows.length} posts conferidos\n`)

  if (!commentDrift.length) {
    console.info('✅ commentCount: nenhum divergente')
  } else {
    console.info(`⚠️  commentCount divergente em ${commentDrift.length}:`)
    for (const row of commentDrift) {
      console.info(`   ${row.id}: ${row.commentCount} → ${row.realComments}`)
    }
    if (!dryRun) {
      await pool.query(`
        UPDATE post p
           SET "commentCount" = (SELECT count(*)::int FROM comment c
                                  WHERE c."postId" = p.id AND c.deleted = false)
      `)
      console.info('   corrigido.')
    }
  }

  console.info('')

  if (!likeDrift.length) {
    console.info('✅ likeCount: bate com as linhas de reaction')
    return
  }

  console.info(`ℹ️  likeCount acima das linhas reais em ${likeDrift.length} post(s):`)
  for (const row of likeDrift) {
    const diff = row.likeCount - row.realLikes
    console.info(
      `   ${row.id}: mostra ${row.likeCount}, ${row.realLikes} real` +
        `${diff > 0 ? ` (${diff} de vitrine)` : ''}`,
    )
  }

  if (!alsoLikes) {
    console.info('\n   Isto é esperado: o seed semeia curtidas de vitrine.')
    console.info('   Para zerar mesmo assim: --likes')
    return
  }

  if (dryRun) {
    console.info('\n   --dry-run: nada escrito.')
    return
  }

  await pool.query(`
    UPDATE post p
       SET "likeCount" = (SELECT count(*)::int FROM reaction r
                           WHERE r."postId" = p.id AND r.type = 'like')
  `)
  console.info('\n   🔴 likeCount zerado na contagem real — a vitrine do seed foi perdida.')
}

try {
  await main()
} catch (error) {
  console.error('❌ recount falhou:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
