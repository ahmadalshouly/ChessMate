CREATE TABLE "tournament_games" (
	"tournament_id" text NOT NULL,
	"game_id" text NOT NULL,
	"round" integer NOT NULL,
	"white_id" text NOT NULL,
	"white_name" text NOT NULL,
	"white_rating" integer NOT NULL,
	"black_id" text,
	"black_name" text,
	"black_rating" integer,
	"result" text DEFAULT '*' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "tournament_games_tournament_id_game_id_pk" PRIMARY KEY("tournament_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_players" (
	"tournament_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"rating" integer NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"color_balance" integer DEFAULT 0 NOT NULL,
	"last_color" text,
	"had_bye" boolean DEFAULT false NOT NULL,
	"opponents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"prize" jsonb,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_players_tournament_id_user_id_pk" PRIMARY KEY("tournament_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"format" text NOT NULL,
	"initial_ms" integer NOT NULL,
	"increment_ms" integer NOT NULL,
	"rated" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer,
	"rounds" integer,
	"max_players" integer,
	"min_rating" integer,
	"max_rating" integer,
	"prize_pool" jsonb,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"cancel_reason" text,
	"reminded" boolean DEFAULT false NOT NULL,
	"winner_id" text,
	"created_by" text NOT NULL,
	"created_by_name" text NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_players_user_idx" ON "tournament_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tournaments_status_idx" ON "tournaments" USING btree ("status","starts_at");