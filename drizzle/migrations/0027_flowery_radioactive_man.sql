CREATE TABLE "outbound_message" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"to_email" text,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_by_model" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbound_message_lead_id_idx" ON "outbound_message" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "outbound_message_status_idx" ON "outbound_message" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbound_message_created_at_idx" ON "outbound_message" USING btree ("created_at");