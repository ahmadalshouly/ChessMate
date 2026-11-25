-- Online computer opponents that staff create in the console (streamer and
-- creator bots). Written so it can run twice (see 0021_lessons).
CREATE TABLE IF NOT EXISTS "online_bots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text,
	"rating" integer NOT NULL,
	"style" text DEFAULT 'balanced' NOT NULL,
	"tag" text,
	"url" text,
	"image" text,
	"image_url" text,
	"featured" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"player_wins" integer DEFAULT 0 NOT NULL,
	"bot_wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "online_bots_enabled_idx" ON "online_bots" USING btree ("enabled","rating");
