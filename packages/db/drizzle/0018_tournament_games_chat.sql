CREATE TABLE "tournament_games" (
	"tournament_id" text NOT NULL,
	"game_id" text NOT NULL,
	"round" integer,
	"white_id" text NOT NULL,
	"black_id" text NOT NULL,
	"white_name" text NOT NULL,
	"black_name" text NOT NULL,
	"result" text DEFAULT '*' NOT NULL,
	"end_reason" text,
	"counted" boolean DEFAULT false NOT NULL,
	"white_points" integer DEFAULT 0 NOT NULL,
	"black_points" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "tournament_games_tournament_id_game_id_pk" PRIMARY KEY("tournament_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"body" text NOT NULL,
	"staff" boolean DEFAULT false NOT NULL,
	"filtered" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by" text
);
--> statement-breakpoint
ALTER TABLE "tournament_games" ADD CONSTRAINT "tournament_games_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_messages" ADD CONSTRAINT "tournament_messages_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tournament_games_started_idx" ON "tournament_games" USING btree ("tournament_id","started_at");--> statement-breakpoint
CREATE INDEX "tournament_messages_tournament_idx" ON "tournament_messages" USING btree ("tournament_id","created_at");