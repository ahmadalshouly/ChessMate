CREATE TABLE "fair_play_records" (
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"player_id" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fair_play_records_kind_key_pk" PRIMARY KEY("kind","key")
);
--> statement-breakpoint
CREATE TABLE "title_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"full_name" text NOT NULL,
	"fide_id" text,
	"federation" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_by_name" text,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "title_granted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "title_applications" ADD CONSTRAINT "title_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "title_documents" ADD CONSTRAINT "title_documents_application_id_title_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."title_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fair_play_player_idx" ON "fair_play_records" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "title_app_user_idx" ON "title_applications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "title_app_status_idx" ON "title_applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "title_doc_app_idx" ON "title_documents" USING btree ("application_id");