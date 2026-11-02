CREATE TABLE "courseProviderPrice" (
	"id" text PRIMARY KEY,
	"courseId" text NOT NULL,
	"provider" text NOT NULL,
	"providerPriceId" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment" ADD COLUMN "courseId" text;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "priceCents" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "courseProviderPrice_providerPriceId_uidx" ON "courseProviderPrice" ("providerPriceId");--> statement-breakpoint
CREATE INDEX "courseProviderPrice_courseId_provider_idx" ON "courseProviderPrice" ("courseId","provider");--> statement-breakpoint
CREATE INDEX "payment_courseId_idx" ON "payment" ("courseId");--> statement-breakpoint
ALTER TABLE "courseProviderPrice" ADD CONSTRAINT "courseProviderPrice_courseId_course_id_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_courseId_course_id_fkey" FOREIGN KEY ("courseId") REFERENCES "course"("id") ON DELETE SET NULL;