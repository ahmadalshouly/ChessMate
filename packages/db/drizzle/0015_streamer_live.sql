ALTER TABLE "streamers" ADD COLUMN "live_viewers" integer;--> statement-breakpoint
ALTER TABLE "streamers" ADD COLUMN "live_thumbnail" text;--> statement-breakpoint
ALTER TABLE "streamers" ADD COLUMN "live_embed" text;--> statement-breakpoint
ALTER TABLE "streamers" ADD COLUMN "live_auto" boolean DEFAULT false NOT NULL;
