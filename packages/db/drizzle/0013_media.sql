ALTER TABLE "broadcast_events" ADD COLUMN "cover" text;--> statement-breakpoint
ALTER TABLE "broadcast_events" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcast_news" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "broadcast_news" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "news_posts" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "news_posts" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;
