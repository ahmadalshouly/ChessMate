CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streamers" (
	"user_id" text PRIMARY KEY NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"live_title" text,
	"live_url" text,
	"live_since" timestamp with time zone,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streamer_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channels" jsonb NOT NULL,
	"about" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "broadcast_events" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_description" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"format" text DEFAULT 'other' NOT NULL,
	"time_control" text DEFAULT '' NOT NULL,
	"website" text,
	"logo" text,
	"published" boolean DEFAULT false NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'chessmate' NOT NULL,
	"external_id" text,
	"source_url" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_organizers" (
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "broadcast_organizers_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "broadcast_players" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"rating" integer,
	"federation" text,
	"fide_id" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone,
	"source_kind" text DEFAULT 'manual' NOT NULL,
	"source_url" text,
	"lichess_round_id" text,
	"source_finished" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_games" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"event_id" text NOT NULL,
	"board" integer NOT NULL,
	"white_name" text NOT NULL,
	"black_name" text NOT NULL,
	"white_title" text,
	"black_title" text,
	"white_rating" integer,
	"black_rating" integer,
	"white_fed" text,
	"black_fed" text,
	"white_player_id" text,
	"black_player_id" text,
	"result" text DEFAULT '*' NOT NULL,
	"initial_fen" text NOT NULL,
	"moves" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fen" text NOT NULL,
	"ply" integer DEFAULT 0 NOT NULL,
	"last_move" text,
	"white_clock_ms" integer,
	"black_clock_ms" integer,
	"clock_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_news" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"author_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcast_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"event_name" text NOT NULL,
	"organization" text NOT NULL,
	"website" text,
	"location" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"coverage" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"event_id" text,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "streamers" ADD CONSTRAINT "streamers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "streamer_applications" ADD CONSTRAINT "streamer_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "streamer_applications_user_idx" ON "streamer_applications" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "streamer_applications_status_idx" ON "streamer_applications" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "broadcast_events_starts_idx" ON "broadcast_events" USING btree ("starts_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_events_external_idx" ON "broadcast_events" USING btree ("source","external_id");
--> statement-breakpoint
ALTER TABLE "broadcast_organizers" ADD CONSTRAINT "broadcast_organizers_event_id_broadcast_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."broadcast_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_organizers" ADD CONSTRAINT "broadcast_organizers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_organizers_user_idx" ON "broadcast_organizers" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "broadcast_players" ADD CONSTRAINT "broadcast_players_event_id_broadcast_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."broadcast_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_players" ADD CONSTRAINT "broadcast_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_players_event_idx" ON "broadcast_players" USING btree ("event_id");
--> statement-breakpoint
ALTER TABLE "broadcast_rounds" ADD CONSTRAINT "broadcast_rounds_event_id_broadcast_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."broadcast_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_rounds_event_idx" ON "broadcast_rounds" USING btree ("event_id");
--> statement-breakpoint
ALTER TABLE "broadcast_games" ADD CONSTRAINT "broadcast_games_round_id_broadcast_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."broadcast_rounds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "broadcast_games" ADD CONSTRAINT "broadcast_games_event_id_broadcast_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."broadcast_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "broadcast_games_round_board_idx" ON "broadcast_games" USING btree ("round_id","board");
--> statement-breakpoint
CREATE INDEX "broadcast_games_event_idx" ON "broadcast_games" USING btree ("event_id");
--> statement-breakpoint
ALTER TABLE "broadcast_news" ADD CONSTRAINT "broadcast_news_event_id_broadcast_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."broadcast_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_news_event_idx" ON "broadcast_news" USING btree ("event_id","created_at");
--> statement-breakpoint
ALTER TABLE "broadcast_applications" ADD CONSTRAINT "broadcast_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "broadcast_applications_user_idx" ON "broadcast_applications" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "broadcast_applications_status_idx" ON "broadcast_applications" USING btree ("status");
