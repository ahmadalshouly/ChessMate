-- Game collections: named lists of games a player keeps, each private until
-- its owner shows it on their profile. Written so it can run twice (see 0021_lessons).
CREATE TABLE IF NOT EXISTS "game_collections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_collection_items" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"title" text NOT NULL,
	"link_path" text NOT NULL,
	"link_query" jsonb,
	"link_key" text NOT NULL,
	"pgn" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "game_collections" ADD CONSTRAINT "game_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "game_collection_items" ADD CONSTRAINT "game_collection_items_collection_id_game_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."game_collections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "game_collection_items_link_uq" ON "game_collection_items" USING btree ("collection_id","link_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_collection_items_added_idx" ON "game_collection_items" USING btree ("collection_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_collections_user_idx" ON "game_collections" USING btree ("user_id","updated_at");
