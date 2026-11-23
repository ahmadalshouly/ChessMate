CREATE TABLE "broadcast_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
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
ALTER TABLE "broadcast_events" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "broadcast_messages" ADD CONSTRAINT "broadcast_messages_event_id_broadcast_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."broadcast_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "broadcast_messages_event_idx" ON "broadcast_messages" USING btree ("event_id","created_at");