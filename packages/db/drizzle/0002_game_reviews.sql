CREATE TABLE "game_reviews" (
	"key" text PRIMARY KEY NOT NULL,
	"game_id" text,
	"review" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "game_reviews_game_idx" ON "game_reviews" USING btree ("game_id");