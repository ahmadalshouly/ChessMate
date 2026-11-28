-- App analytics events for Admin → Analytics, only from visitors who allowed analytics.
-- Written so it can run twice (see 0021_lessons).
CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"device_id" text NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text,
	"platform" text NOT NULL,
	"screen" text,
	"props" jsonb,
	"app_version" text,
	"lang" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_at_idx" ON "analytics_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_name_idx" ON "analytics_events" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_session_idx" ON "analytics_events" USING btree ("session_id");