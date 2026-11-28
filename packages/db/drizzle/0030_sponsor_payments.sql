-- Sponsor payments and conversations, and recorded donations.
-- Staff and a sponsor applicant talk in sponsor_messages and staff send Stripe
-- Payment Links (sponsor_payments); the applicant follows it on a page opened
-- with sponsor_applications.access_token. Written so it can run twice (see 0021_lessons).
CREATE TABLE IF NOT EXISTS "donations" (
	"id" text PRIMARY KEY NOT NULL,
	"stripe_session_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"user_id" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "donations_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsor_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"sender" text NOT NULL,
	"author" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsor_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"stripe_link_id" text NOT NULL,
	"url" text NOT NULL,
	"stripe_session_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	CONSTRAINT "sponsor_payments_stripe_link_id_unique" UNIQUE("stripe_link_id")
);
--> statement-breakpoint
ALTER TABLE "sponsor_applications" ADD COLUMN IF NOT EXISTS "access_token" text;--> statement-breakpoint
ALTER TABLE "sponsor_applications" ADD COLUMN IF NOT EXISTS "staff_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sponsor_applications" ADD COLUMN IF NOT EXISTS "applicant_seen_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sponsor_messages" ADD CONSTRAINT "sponsor_messages_application_id_sponsor_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."sponsor_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sponsor_payments" ADD CONSTRAINT "sponsor_payments_application_id_sponsor_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."sponsor_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "donations_created_idx" ON "donations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sponsor_messages_app_idx" ON "sponsor_messages" USING btree ("application_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sponsor_payments_app_idx" ON "sponsor_payments" USING btree ("application_id","created_at");--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sponsor_applications" ADD CONSTRAINT "sponsor_applications_access_token_unique" UNIQUE("access_token");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
