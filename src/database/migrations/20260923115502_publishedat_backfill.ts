import type { PoolClient } from 'pg'

// Backfill de `post.publishedAt`.
//
// 🔴 **O cursor do feed compara `(publishedAt, id)` como row value**, e no Postgres
// qualquer comparação com NULL devolve NULL — a linha some da página sem erro nenhum.
// Post publicado sem data carimbada existia: `post.update({published: true})` não mexia
// em `publishedAt`, e o seed anterior à Fase 12 também não garantia.
//
// Depois desta migration, quem carimba é `setPostPublished`, com
// `coalesce(publishedAt, now())` — republicar não reescreve a data original.
const sql = `UPDATE "post"
SET "publishedAt" = COALESCE("publishedAt", "createdAt", now())
WHERE "published" = true AND "publishedAt" IS NULL;`

export async function up(client: PoolClient) {
  await client.query(sql)
}
