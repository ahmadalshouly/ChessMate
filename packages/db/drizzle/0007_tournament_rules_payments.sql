ALTER TABLE "tournaments" ADD COLUMN "entry_fee_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "currency" text DEFAULT 'eur' NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "min_rating" integer;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "max_rating" integer;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "min_rated_games" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "late_join" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "rules" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "sponsor_name" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "sponsor_url" text;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "sponsor_logo" text;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD COLUMN "disqualified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD COLUMN "rules_accepted_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "tournament_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"user_id" text NOT NULL,
	"stripe_session_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	CONSTRAINT "tournament_payments_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "sponsor_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text,
	"website" text,
	"budget" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"staff_note" text,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payout_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"place" integer NOT NULL,
	"prize" text NOT NULL,
	"method" text NOT NULL,
	"details" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'new' NOT NULL,
	"staff_note" text,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "tournament_payments_player_idx" ON "tournament_payments" USING btree ("tournament_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_requests_player_idx" ON "payout_requests" USING btree ("tournament_id","user_id");