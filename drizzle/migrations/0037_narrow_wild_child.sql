CREATE TABLE "whatsapp_message" (
	"id" text PRIMARY KEY NOT NULL,
	"wa_message_id" text NOT NULL,
	"direction" text DEFAULT 'inbound' NOT NULL,
	"from_phone" text NOT NULL,
	"to_phone" text,
	"contact_name" text,
	"body" text,
	"received_at" timestamp,
	"lead_id" text,
	"customer_id" text,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_message_wa_message_id_unique" UNIQUE("wa_message_id")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_message_lead_id_idx" ON "whatsapp_message" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "whatsapp_message_customer_id_idx" ON "whatsapp_message" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "whatsapp_message_received_at_idx" ON "whatsapp_message" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "whatsapp_message_dismissed_at_idx" ON "whatsapp_message" USING btree ("dismissed_at");