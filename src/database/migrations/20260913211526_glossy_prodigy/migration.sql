CREATE TABLE "postContent" (
	"postId" text PRIMARY KEY,
	"body" text
);
--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "teaser" text;--> statement-breakpoint
ALTER TABLE "post" DROP COLUMN "body";--> statement-breakpoint
ALTER TABLE "postContent" ADD CONSTRAINT "postContent_postId_post_id_fkey" FOREIGN KEY ("postId") REFERENCES "post"("id") ON DELETE CASCADE;