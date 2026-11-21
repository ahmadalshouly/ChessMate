CREATE TABLE "play_habits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"limits_enabled" boolean DEFAULT false NOT NULL,
	"max_games" integer DEFAULT 5 NOT NULL,
	"window_minutes" integer DEFAULT 60 NOT NULL,
	"cooldown_minutes" integer DEFAULT 60 NOT NULL,
	"locked_until" timestamp with time zone,
	"recent_games" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"streak_start" timestamp with time zone,
	"last_played_at" timestamp with time zone,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"tz_offset_min" integer DEFAULT 0 NOT NULL,
	"last_computer_game_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
