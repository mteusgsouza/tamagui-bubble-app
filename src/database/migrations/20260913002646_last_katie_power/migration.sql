CREATE TABLE "billingCustomer" (
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"customerId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planProviderPrice" (
	"id" text PRIMARY KEY,
	"planId" text NOT NULL,
	"provider" text NOT NULL,
	"providerPriceId" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "accessDays" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "billingCustomer_userId_provider_uidx" ON "billingCustomer" ("userId","provider");--> statement-breakpoint
CREATE INDEX "billingCustomer_customerId_idx" ON "billingCustomer" ("customerId");--> statement-breakpoint
CREATE UNIQUE INDEX "planProviderPrice_providerPriceId_uidx" ON "planProviderPrice" ("providerPriceId");--> statement-breakpoint
CREATE INDEX "planProviderPrice_planId_provider_idx" ON "planProviderPrice" ("planId","provider");--> statement-breakpoint
ALTER TABLE "billingCustomer" ADD CONSTRAINT "billingCustomer_userId_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "planProviderPrice" ADD CONSTRAINT "planProviderPrice_planId_plan_id_fkey" FOREIGN KEY ("planId") REFERENCES "plan"("id") ON DELETE CASCADE;