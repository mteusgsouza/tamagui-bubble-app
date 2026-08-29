import type { PoolClient } from 'pg'

const sql = `DROP TABLE "todo";`

export async function up(client: PoolClient) {
  await client.query(sql)
}
