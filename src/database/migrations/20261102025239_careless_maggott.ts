import type { PoolClient } from 'pg'

const sql = `ALTER TABLE "lesson" ADD COLUMN "announcedAt" timestamp;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "announcedAt" timestamp;--> statement-breakpoint
ALTER TABLE "userState" ADD COLUMN "notifyNewPost" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "userState" ADD COLUMN "notifyNewLesson" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "post" SET "announcedAt" = now() WHERE "published" = true;--> statement-breakpoint
UPDATE "lesson" SET "announcedAt" = now() WHERE "published" = true;`

export async function up(client: PoolClient) {
  await client.query(sql)
}
