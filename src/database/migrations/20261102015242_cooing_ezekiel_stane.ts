import type { PoolClient } from 'pg'

const sql = `CREATE TABLE "certificate" (
	"id" text PRIMARY KEY,
	"userId" text NOT NULL,
	"courseId" text NOT NULL,
	"code" text NOT NULL,
	"issuedAt" timestamp DEFAULT now() NOT NULL,
	"lessonsCompleted" integer NOT NULL,
	"lessonsTotal" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "certificateEnabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "completionRule" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "minLessons" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_code_uidx" ON "certificate" ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "certificate_userId_courseId_uidx" ON "certificate" ("userId","courseId");--> statement-breakpoint
CREATE INDEX "certificate_courseId_idx" ON "certificate" ("courseId");--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_userId_userPublic_id_fkey" FOREIGN KEY ("userId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_courseId_course_id_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE;`

export async function up(client: PoolClient) {
  await client.query(sql)
}
