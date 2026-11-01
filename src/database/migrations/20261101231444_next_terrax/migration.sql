CREATE TABLE "enrollment" (
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
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_subscriptionId_subscription_id_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE SET NULL;