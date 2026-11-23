CREATE TABLE "award_stats" (
	"user_id" text PRIMARY KEY NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_awards" (
	"user_id" text NOT NULL,
	"award_id" text NOT NULL,
	"level" smallint NOT NULL,
	"game_id" text,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_awards_user_id_award_id_level_pk" PRIMARY KEY("user_id","award_id","level")
);
--> statement-breakpoint
ALTER TABLE "award_stats" ADD CONSTRAINT "award_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_awards" ADD CONSTRAINT "user_awards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_awards_recent_idx" ON "user_awards" USING btree ("user_id","earned_at");
