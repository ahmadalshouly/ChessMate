ALTER TABLE "broadcast_games" ADD COLUMN "evals" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcast_games" ADD COLUMN "grades" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcast_games" ADD COLUMN "eval_score" jsonb;--> statement-breakpoint
ALTER TABLE "broadcast_games" ADD COLUMN "last_grade" text;
