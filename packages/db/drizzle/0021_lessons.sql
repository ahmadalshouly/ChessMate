-- Written so it can run twice: development databases that ran an earlier, unmerged
-- 0021 recorded the same journal time and skipped this one, so it was moved later.
CREATE TABLE IF NOT EXISTS "lesson_chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"blurb" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lessons" (
	"id" text PRIMARY KEY NOT NULL,
	"chapter_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "lessons" ADD CONSTRAINT "lessons_chapter_id_lesson_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."lesson_chapters"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lessons_chapter_idx" ON "lessons" USING btree ("chapter_id","position");
