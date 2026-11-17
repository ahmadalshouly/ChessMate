CREATE TYPE "public"."color" AS ENUM('w', 'b');--> statement-breakpoint
CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."game_end_reason" AS ENUM('checkmate', 'stalemate', 'insufficient_material', 'threefold_repetition', 'fifty_move_rule', 'timeout', 'timeout_vs_insufficient', 'resignation', 'draw_agreement', 'abandoned', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."game_result" AS ENUM('1-0', '0-1', '1/2-1/2', '*');--> statement-breakpoint
CREATE TYPE "public"."game_status" AS ENUM('active', 'finished', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."move_classification" AS ENUM('best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder');--> statement-breakpoint
CREATE TYPE "public"."rating_category" AS ENUM('bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'puzzle');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'moderator', 'admin');--> statement-breakpoint
CREATE TABLE "friendships" (
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friendships_requester_id_addressee_id_pk" PRIMARY KEY("requester_id","addressee_id"),
	CONSTRAINT "friendships_not_self" CHECK ("friendships"."requester_id" <> "friendships"."addressee_id")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" text PRIMARY KEY NOT NULL,
	"white_user_id" text,
	"black_user_id" text,
	"white_name" text NOT NULL,
	"black_name" text NOT NULL,
	"initial_ms" integer NOT NULL,
	"increment_ms" integer NOT NULL,
	"time_category" "rating_category" NOT NULL,
	"rated" boolean NOT NULL,
	"initial_fen" text NOT NULL,
	"status" "game_status" DEFAULT 'active' NOT NULL,
	"result" "game_result" DEFAULT '*' NOT NULL,
	"winner" "color",
	"end_reason" "game_end_reason",
	"pgn" text,
	"final_fen" text,
	"ply_count" integer DEFAULT 0 NOT NULL,
	"white_rating_before" real,
	"black_rating_before" real,
	"white_rating_after" real,
	"black_rating_after" real,
	"eco" text,
	"opening_name" text,
	"white_accuracy" real,
	"black_accuracy" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "moves" (
	"game_id" text NOT NULL,
	"ply" smallint NOT NULL,
	"uci" text NOT NULL,
	"san" text NOT NULL,
	"fen_after" text NOT NULL,
	"white_ms" integer,
	"black_ms" integer,
	"spent_ms" integer,
	"eval_cp" integer,
	"eval_mate" smallint,
	"best_uci" text,
	"classification" "move_classification",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "moves_game_id_ply_pk" PRIMARY KEY("game_id","ply")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puzzle_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"puzzle_id" text NOT NULL,
	"solved" boolean NOT NULL,
	"time_ms" integer,
	"rated" boolean DEFAULT true NOT NULL,
	"rating_before" real,
	"rating_after" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puzzles" (
	"id" text PRIMARY KEY NOT NULL,
	"fen" text NOT NULL,
	"moves" text[] NOT NULL,
	"rating" real DEFAULT 1500 NOT NULL,
	"rd" real DEFAULT 350 NOT NULL,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" text,
	"source_id" text,
	"plays" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"category" "rating_category" NOT NULL,
	"rating" real NOT NULL,
	"rd" real NOT NULL,
	"volatility" real NOT NULL,
	"game_id" text,
	"puzzle_attempt_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"user_id" text NOT NULL,
	"category" "rating_category" NOT NULL,
	"rating" real DEFAULT 1500 NOT NULL,
	"rd" real DEFAULT 350 NOT NULL,
	"volatility" real DEFAULT 0.06 NOT NULL,
	"games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"peak" real,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_user_id_category_pk" PRIMARY KEY("user_id","category")
);
--> statement-breakpoint
CREATE TABLE "refresh_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"family_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" text,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"email_verified_at" timestamp with time zone,
	"password_hash" text,
	"password_changed_at" timestamp with time zone,
	"display_name" text,
	"avatar_url" text,
	"bio" text,
	"country" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_white_user_id_users_id_fk" FOREIGN KEY ("white_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_user_id_users_id_fk" FOREIGN KEY ("black_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puzzle_attempts" ADD CONSTRAINT "puzzle_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "puzzle_attempts" ADD CONSTRAINT "puzzle_attempts_puzzle_id_puzzles_id_fk" FOREIGN KEY ("puzzle_id") REFERENCES "public"."puzzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friendships_addressee_idx" ON "friendships" USING btree ("addressee_id","status");--> statement-breakpoint
CREATE INDEX "games_white_idx" ON "games" USING btree ("white_user_id","started_at");--> statement-breakpoint
CREATE INDEX "games_black_idx" ON "games" USING btree ("black_user_id","started_at");--> statement-breakpoint
CREATE INDEX "games_status_idx" ON "games" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "oauth_accounts_user_idx" ON "oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "puzzle_attempts_user_idx" ON "puzzle_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "puzzle_attempts_puzzle_idx" ON "puzzle_attempts" USING btree ("puzzle_id");--> statement-breakpoint
CREATE INDEX "puzzles_rating_idx" ON "puzzles" USING btree ("rating");--> statement-breakpoint
CREATE UNIQUE INDEX "puzzles_source_idx" ON "puzzles" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "rating_history_user_idx" ON "rating_history" USING btree ("user_id","category","created_at");--> statement-breakpoint
CREATE INDEX "ratings_leaderboard_idx" ON "ratings" USING btree ("category","rating");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_sessions_token_hash_idx" ON "refresh_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_sessions_user_idx" ON "refresh_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_sessions_family_idx" ON "refresh_sessions" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");