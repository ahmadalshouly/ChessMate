ALTER TABLE "tournaments" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "current_round" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD COLUMN "state" jsonb DEFAULT '{}'::jsonb NOT NULL;
