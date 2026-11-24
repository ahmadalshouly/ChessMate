-- Push campaigns (admin console: send now, schedule, triggers). Numbered 0023 and dated after
-- 0022 (Football Mate, PR 80) so the two never share a number or a journal time.
-- Written so it can run twice.
CREATE TABLE IF NOT EXISTS "push_campaign_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"message" jsonb NOT NULL,
	"audience" jsonb NOT NULL,
	"trigger" jsonb,
	"schedule_at" timestamp with time zone,
	"stats" jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_trigger_jobs" (
	"campaign_id" text NOT NULL,
	"user_id" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_trigger_jobs_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "push_campaign_deliveries" ADD CONSTRAINT "push_campaign_deliveries_campaign_id_push_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."push_campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "push_campaign_deliveries" ADD CONSTRAINT "push_campaign_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "push_trigger_jobs" ADD CONSTRAINT "push_trigger_jobs_campaign_id_push_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."push_campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "push_trigger_jobs" ADD CONSTRAINT "push_trigger_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_campaign_deliveries_campaign_idx" ON "push_campaign_deliveries" USING btree ("campaign_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_campaign_deliveries_user_idx" ON "push_campaign_deliveries" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_campaigns_status_idx" ON "push_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_trigger_jobs_due_idx" ON "push_trigger_jobs" USING btree ("due_at");