-- Dig Deep, the opening explorer: counts of ChessMate's own games per position
-- and move, and a cache of Lichess opening explorer answers. Written so it can
-- run twice (see 0021_lessons).
CREATE TABLE IF NOT EXISTS "explorer_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"body" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_moves" (
	"position" text NOT NULL,
	"uci" text NOT NULL,
	"san" text NOT NULL,
	"white" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"black" integer DEFAULT 0 NOT NULL,
	"rating_sum" bigint DEFAULT 0 NOT NULL,
	"rated_games" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "explorer_moves_position_uci_pk" PRIMARY KEY("position","uci")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "explorer_cache_fetched_idx" ON "explorer_cache" USING btree ("fetched_at");
