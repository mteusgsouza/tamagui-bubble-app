import type { PoolClient } from 'pg'

const sql = `CREATE TABLE "enrollment" (
	"id" text PRIMARY KEY,
	"userId" text NOT NULL,
	"courseId" text NOT NULL,
	"source" text NOT NULL,
	"subscriptionId" text,
	"grantedBy" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"revokedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "publishedAt" timestamp;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "subscriberAccess" text DEFAULT 'included' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_userId_courseId_uidx" ON "enrollment" ("userId","courseId");--> statement-breakpoint
CREATE INDEX "enrollment_courseId_idx" ON "enrollment" ("courseId");--> statement-breakpoint
CREATE INDEX "enrollment_subscriptionId_idx" ON "enrollment" ("subscriptionId");--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_userId_userPublic_id_fkey" FOREIGN KEY ("userId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_courseId_course_id_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_subscriptionId_subscription_id_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE SET NULL;`

// Backfill — a parte do arquivo que o drizzle não gera e que quebra produção se faltar.
//
// 🔴 1. `publishedAt` nulo some da comparação do `since-subscription` sem erro nenhum (a
// mesma classe de `20260923115502_publishedat_backfill`). Todo curso publicado precisa de
// data.
const backfillPublishedAt = `UPDATE "course"
SET "publishedAt" = COALESCE("publishedAt", "createdAt", now())
WHERE "published" = true AND "publishedAt" IS NULL;`

// 🔴 2. Quem já assina não pode perder acesso no deploy: sem esta linha, todo assinante
// ativo abriria o app e descobriria que os cursos sumiram.
const backfillEnrollments = `INSERT INTO "enrollment" (id, "userId", "courseId", source, "subscriptionId", "createdAt")
SELECT gen_random_uuid()::text, s."userId", c.id, 'subscription', s.id, now()
  FROM "subscription" s
  JOIN "course" c ON c."feedOwnerId" = s."creatorId"
 WHERE s.status IN ('active', 'trialing')
   AND c.published = true
   AND (c."requiredPlanId" IS NULL OR c."requiredPlanId" = s."planId")
ON CONFLICT DO NOTHING;`

export async function up(client: PoolClient) {
  await client.query(sql)
  await client.query(backfillPublishedAt)
  await client.query(backfillEnrollments)
}
