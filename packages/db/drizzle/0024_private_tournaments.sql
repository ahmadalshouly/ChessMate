-- Private (invite-only) tournaments: only the invited players may join and play;
-- everyone else can still watch. Written so it can run twice (see 0021_lessons).
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "invited" jsonb DEFAULT '[]'::jsonb NOT NULL;
