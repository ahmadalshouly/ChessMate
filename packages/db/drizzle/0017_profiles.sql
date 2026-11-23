CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"bio" text,
	"country" text,
	"avatar" jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
