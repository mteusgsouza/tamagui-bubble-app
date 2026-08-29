import type { PoolClient } from 'pg'

const sql = `CREATE TABLE "payment" (
	"id" text PRIMARY KEY,
	"userId" text NOT NULL,
	"subscriptionId" text,
	"provider" text DEFAULT 'manual' NOT NULL,
	"providerPaymentId" text,
	"amountCents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"status" text DEFAULT 'paid' NOT NULL,
	"paidAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY,
	"postId" text NOT NULL,
	"userId" text NOT NULL,
	"parentId" text,
	"body" text NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" text PRIMARY KEY,
	"feedOwnerId" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"coverMediaId" text,
	"visibility" text DEFAULT 'subscribers' NOT NULL,
	"requiredPlanId" text,
	"published" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courseModule" (
	"id" text PRIMARY KEY,
	"courseId" text NOT NULL,
	"title" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson" (
	"id" text PRIMARY KEY,
	"courseId" text NOT NULL,
	"moduleId" text,
	"title" text NOT NULL,
	"body" text,
	"mediaId" text,
	"durationSec" integer,
	"order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"freePreview" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessonProgress" (
	"id" text PRIMARY KEY,
	"userId" text NOT NULL,
	"lessonId" text NOT NULL,
	"positionSec" integer DEFAULT 0 NOT NULL,
	"completedAt" timestamp,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY,
	"ownerId" text NOT NULL,
	"provider" text DEFAULT 'r2' NOT NULL,
	"storageKey" text NOT NULL,
	"posterKey" text,
	"mime" text NOT NULL,
	"kind" text NOT NULL,
	"sizeBytes" integer DEFAULT 0 NOT NULL,
	"durationSec" integer,
	"width" integer,
	"height" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" text PRIMARY KEY,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"priceCents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post" (
	"id" text PRIMARY KEY,
	"feedOwnerId" text NOT NULL,
	"kind" text NOT NULL,
	"title" text,
	"body" text,
	"visibility" text DEFAULT 'subscribers' NOT NULL,
	"requiredPlanId" text,
	"published" boolean DEFAULT false NOT NULL,
	"publishedAt" timestamp,
	"likeCount" integer DEFAULT 0 NOT NULL,
	"commentCount" integer DEFAULT 0 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "postMedia" (
	"id" text PRIMARY KEY,
	"postId" text NOT NULL,
	"mediaId" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reaction" (
	"id" text PRIMARY KEY,
	"postId" text NOT NULL,
	"userId" text NOT NULL,
	"type" text DEFAULT 'like' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" text PRIMARY KEY,
	"userId" text NOT NULL,
	"creatorId" text NOT NULL,
	"planId" text NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"providerSubscriptionId" text,
	"status" text DEFAULT 'active' NOT NULL,
	"currentPeriodEnd" timestamp,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "payment_userId_idx" ON "payment" ("userId");--> statement-breakpoint
CREATE INDEX "payment_subscriptionId_idx" ON "payment" ("subscriptionId");--> statement-breakpoint
CREATE INDEX "comment_postId_createdAt_idx" ON "comment" ("postId","createdAt");--> statement-breakpoint
CREATE INDEX "comment_parentId_idx" ON "comment" ("parentId");--> statement-breakpoint
CREATE INDEX "comment_userId_idx" ON "comment" ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "course_feedOwnerId_slug_uidx" ON "course" ("feedOwnerId","slug");--> statement-breakpoint
CREATE INDEX "course_feedOwnerId_order_idx" ON "course" ("feedOwnerId","order");--> statement-breakpoint
CREATE INDEX "course_coverMediaId_idx" ON "course" ("coverMediaId");--> statement-breakpoint
CREATE INDEX "courseModule_courseId_order_idx" ON "courseModule" ("courseId","order");--> statement-breakpoint
CREATE INDEX "lesson_courseId_order_idx" ON "lesson" ("courseId","order");--> statement-breakpoint
CREATE INDEX "lesson_moduleId_order_idx" ON "lesson" ("moduleId","order");--> statement-breakpoint
CREATE INDEX "lesson_mediaId_idx" ON "lesson" ("mediaId");--> statement-breakpoint
CREATE UNIQUE INDEX "lessonProgress_userId_lessonId_uidx" ON "lessonProgress" ("userId","lessonId");--> statement-breakpoint
CREATE INDEX "lessonProgress_lessonId_idx" ON "lessonProgress" ("lessonId");--> statement-breakpoint
CREATE INDEX "media_ownerId_createdAt_idx" ON "media" ("ownerId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_slug_uidx" ON "plan" ("slug");--> statement-breakpoint
CREATE INDEX "post_feedOwnerId_publishedAt_idx" ON "post" ("feedOwnerId","publishedAt");--> statement-breakpoint
CREATE INDEX "post_feedOwnerId_createdAt_idx" ON "post" ("feedOwnerId","createdAt");--> statement-breakpoint
CREATE INDEX "post_requiredPlanId_idx" ON "post" ("requiredPlanId");--> statement-breakpoint
CREATE INDEX "postMedia_postId_position_idx" ON "postMedia" ("postId","position");--> statement-breakpoint
CREATE UNIQUE INDEX "postMedia_postId_mediaId_uidx" ON "postMedia" ("postId","mediaId");--> statement-breakpoint
CREATE INDEX "postMedia_mediaId_idx" ON "postMedia" ("mediaId");--> statement-breakpoint
CREATE UNIQUE INDEX "reaction_postId_userId_type_uidx" ON "reaction" ("postId","userId","type");--> statement-breakpoint
CREATE INDEX "reaction_userId_idx" ON "reaction" ("userId");--> statement-breakpoint
CREATE INDEX "subscription_userId_creatorId_status_idx" ON "subscription" ("userId","creatorId","status");--> statement-breakpoint
CREATE INDEX "subscription_creatorId_idx" ON "subscription" ("creatorId");--> statement-breakpoint
CREATE INDEX "subscription_planId_idx" ON "subscription" ("planId");--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_userId_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscriptionId_subscription_id_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscription"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_postId_post_id_fkey" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_userId_userPublic_id_fkey" FOREIGN KEY ("userId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parentId_comment_id_fkey" FOREIGN KEY ("parentId") REFERENCES "comment"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_feedOwnerId_userPublic_id_fkey" FOREIGN KEY ("feedOwnerId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_coverMediaId_media_id_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "media"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_requiredPlanId_plan_id_fkey" FOREIGN KEY ("requiredPlanId") REFERENCES "plan"("id");--> statement-breakpoint
ALTER TABLE "courseModule" ADD CONSTRAINT "courseModule_courseId_course_id_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_courseId_course_id_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_moduleId_courseModule_id_fkey" FOREIGN KEY ("moduleId") REFERENCES "courseModule"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_mediaId_media_id_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "lessonProgress" ADD CONSTRAINT "lessonProgress_userId_userPublic_id_fkey" FOREIGN KEY ("userId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "lessonProgress" ADD CONSTRAINT "lessonProgress_lessonId_lesson_id_fkey" FOREIGN KEY ("lessonId") REFERENCES "lesson"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_ownerId_userPublic_id_fkey" FOREIGN KEY ("ownerId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_feedOwnerId_userPublic_id_fkey" FOREIGN KEY ("feedOwnerId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_requiredPlanId_plan_id_fkey" FOREIGN KEY ("requiredPlanId") REFERENCES "plan"("id");--> statement-breakpoint
ALTER TABLE "postMedia" ADD CONSTRAINT "postMedia_postId_post_id_fkey" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "postMedia" ADD CONSTRAINT "postMedia_mediaId_media_id_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_postId_post_id_fkey" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_userId_userPublic_id_fkey" FOREIGN KEY ("userId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_userId_userPublic_id_fkey" FOREIGN KEY ("userId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_creatorId_userPublic_id_fkey" FOREIGN KEY ("creatorId") REFERENCES "userPublic"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_planId_plan_id_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id");`

export async function up(client: PoolClient) {
  await client.query(sql)
}
