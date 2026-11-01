import type { PoolClient } from 'pg'

const sql = `ALTER TABLE "media" ADD COLUMN "focalX" real DEFAULT 0.5 NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "focalY" real DEFAULT 0.5 NOT NULL;`

export async function up(client: PoolClient) {
  await client.query(sql)
}
