-- Sponsored ad spots: staff switch a spot on, then place a sponsor on it for a
-- period. Written so it can run twice (see 0021_lessons).
CREATE TABLE IF NOT EXISTS "ad_spots" (
	"spot" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"note" text,
	"updated_by" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_placements" (
	"id" text PRIMARY KEY NOT NULL,
	"spot" text NOT NULL,
	"sponsor" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"image" text,
	"image_url" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"stopped" boolean DEFAULT false NOT NULL,
	"application_id" text,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ad_placements_spot_idx" ON "ad_placements" USING btree ("spot","ends_at");--> statement-breakpoint
ALTER TABLE "sponsor_applications" ADD COLUMN IF NOT EXISTS "spot" text;--> statement-breakpoint
ALTER TABLE "sponsor_applications" ADD COLUMN IF NOT EXISTS "material_requested_at" timestamp with time zone;
