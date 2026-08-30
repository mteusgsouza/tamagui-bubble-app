#!/usr/bin/env bun

/**
 * @description Semeia planos e um curso completo (módulos + aulas) para testar a Fase 7.
 *
 *   bun run:dev scripts/seed-courses.ts
 *
 * Idempotente: `ON CONFLICT DO NOTHING` em tudo, então rodar duas vezes não duplica e
 * rodar depois de `bun backend:clean` recria.
 *
 * ⚠️ **Não semeia posts.** Os 5 posts que existem hoje foram criados à mão e este script
 * não os conhece — se o banco for zerado, eles se perdem de qualquer jeito.
 *
 * As aulas nascem **sem mídia** (`mediaId` nulo): vídeo só entra pelo upload da Fase 5.
 * A tela da aula mostra "Esta aula ainda não tem vídeo", que é o estado correto.
 */

import { Pool } from 'pg'

const CREATOR = process.env.VITE_MASTER_USER_ID || 'demo-user-id'
const DB = process.env.ZERO_UPSTREAM_DB

if (!DB) {
  console.error('❌ ZERO_UPSTREAM_DB não está no ambiente.')
  console.error('   Rode assim:  bun run:dev scripts/seed-courses.ts')
  process.exit(1)
}

const pool = new Pool({ connectionString: DB })

type LessonSeed = {
  id: string
  title: string
  body: string
  durationSec: number
  freePreview?: boolean
}

type ModuleSeed = { id: string; title: string; lessons: LessonSeed[] }

const COURSE = {
  id: 'curso-aquisicao',
  slug: 'aquisicao-sem-anuncio',
  title: 'Aquisição sem depender de anúncio',
  description:
    'Como montar um fluxo de aquisição que sobrevive a um mês sem verba de mídia: ' +
    'diagnóstico, oferta, prova e follow-up. Cada módulo termina com um material que ' +
    'você aplica no mesmo dia.',
  // sem plano exigido: qualquer assinatura ativa libera
  requiredPlanId: null as string | null,
}

const MODULES: ModuleSeed[] = [
  {
    id: 'mod-diagnostico',
    title: 'Diagnóstico',
    lessons: [
      {
        id: 'aula-pergunta',
        title: 'O que sua página deveria perguntar',
        body: 'A ordem das perguntas decide a conversão mais do que a cor do botão.',
        durationSec: 724,
        freePreview: true,
      },
      {
        id: 'aula-objecoes',
        title: 'Mapeando as 3 objeções reais',
        body: 'Objeção declarada e objeção real quase nunca são a mesma coisa.',
        durationSec: 570,
      },
      {
        id: 'aula-qualificar',
        title: 'Como qualificar antes de vender',
        body:
          'As três perguntas que colocam o lead em uma faixa de orçamento antes de ' +
          'você falar preço — e o que fazer quando a resposta é "ainda estou pesquisando".',
        durationSec: 1110,
      },
    ],
  },
  {
    id: 'mod-oferta',
    title: 'Oferta',
    lessons: [
      {
        id: 'aula-oferta',
        title: 'A oferta que se explica sozinha',
        body: 'Se precisa de reunião para entender, ainda não é uma oferta.',
        durationSec: 680,
      },
      {
        id: 'aula-ancoragem',
        title: 'Ancoragem sem desconto',
        body: 'Dar desconto é a forma mais cara de resolver um problema de ancoragem.',
        durationSec: 842,
      },
    ],
  },
]

const PLANS = [
  { id: 'plan-mensal', slug: 'mensal', name: 'Mensal', interval: 'month', order: 0 },
  { id: 'plan-anual', slug: 'anual', name: 'Anual', interval: 'year', order: 1 },
]

async function seed() {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    // o criador precisa existir em userPublic — as FKs de conteúdo apontam para lá
    const { rowCount } = await client.query(
      'SELECT 1 FROM "userPublic" WHERE id = $1',
      [CREATOR],
    )
    if (!rowCount) {
      throw new Error(
        `criador "${CREATOR}" não existe em userPublic. ` +
          'Confira VITE_MASTER_USER_ID no .env.development.',
      )
    }

    for (const plan of PLANS) {
      await client.query(
        `INSERT INTO plan (id, slug, name, interval, "order", active)
         VALUES ($1, $2, $3, $4, $5, true) ON CONFLICT (id) DO NOTHING`,
        [plan.id, plan.slug, plan.name, plan.interval, plan.order],
      )
    }

    await client.query(
      `INSERT INTO course (id, "feedOwnerId", slug, title, description,
                           visibility, "requiredPlanId", published, "order")
       VALUES ($1, $2, $3, $4, $5, 'subscribers', $6, true, 0)
       ON CONFLICT (id) DO NOTHING`,
      [
        COURSE.id,
        CREATOR,
        COURSE.slug,
        COURSE.title,
        COURSE.description,
        COURSE.requiredPlanId,
      ],
    )

    let lessonOrder = 0

    for (const [index, courseModule] of MODULES.entries()) {
      await client.query(
        `INSERT INTO "courseModule" (id, "courseId", title, "order")
         VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
        [courseModule.id, COURSE.id, courseModule.title, index],
      )

      for (const lesson of courseModule.lessons) {
        // `order` é global no curso: é ele que define "AULA 3 DE 24" e a próxima aula
        await client.query(
          `INSERT INTO lesson (id, "courseId", "moduleId", title, body,
                               "durationSec", "order", published, "freePreview")
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
           ON CONFLICT (id) DO NOTHING`,
          [
            lesson.id,
            COURSE.id,
            courseModule.id,
            lesson.title,
            lesson.body,
            lesson.durationSec,
            lessonOrder++,
            lesson.freePreview ?? false,
          ],
        )
      }
    }

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

  const lessonCount = MODULES.reduce((sum, m) => sum + m.lessons.length, 0)
  console.info(`✅ curso "${COURSE.title}" semeado`)
  console.info(`   ${MODULES.length} módulos · ${lessonCount} aulas · criador ${CREATOR}`)
  console.info(`   abra: http://localhost:8081/home/courses/${COURSE.slug}`)
} catch (error) {
  console.error('❌ seed falhou:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
