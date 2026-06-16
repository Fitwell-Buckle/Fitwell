CREATE TABLE "trade_show" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"city" text,
	"country" text,
	"starts_on" date,
	"ends_on" date,
	"source_channel" text DEFAULT 'b2b_trade_shows_industry' NOT NULL,
	"notes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_show_vendor" (
	"id" text PRIMARY KEY NOT NULL,
	"trade_show_id" text NOT NULL,
	"booth" text,
	"company_name" text NOT NULL,
	"category" text,
	"side" text DEFAULT 'both' NOT NULL,
	"priority" boolean DEFAULT false NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"title" text,
	"website" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"seed_notes" text,
	"response_raw" text,
	"meeting_raw" text,
	"visited" boolean DEFAULT false NOT NULL,
	"visited_at" timestamp,
	"visited_by_user_id" text,
	"notes" text,
	"card_image_url" text,
	"card_raw_text" text,
	"ocr_confidence" jsonb,
	"follow_up_status" text DEFAULT 'none' NOT NULL,
	"next_steps" text,
	"lead_id" text,
	"supplier_lead_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_show_vendor_voice_note" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"duration_sec" real,
	"transcript" text,
	"recorded_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_show_vendor" ADD CONSTRAINT "trade_show_vendor_trade_show_id_trade_show_id_fk" FOREIGN KEY ("trade_show_id") REFERENCES "public"."trade_show"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_show_vendor" ADD CONSTRAINT "trade_show_vendor_visited_by_user_id_user_id_fk" FOREIGN KEY ("visited_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_show_vendor" ADD CONSTRAINT "trade_show_vendor_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_show_vendor" ADD CONSTRAINT "trade_show_vendor_supplier_lead_id_supplier_lead_id_fk" FOREIGN KEY ("supplier_lead_id") REFERENCES "public"."supplier_lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_show_vendor_voice_note" ADD CONSTRAINT "trade_show_vendor_voice_note_vendor_id_trade_show_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."trade_show_vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_show_vendor_voice_note" ADD CONSTRAINT "trade_show_vendor_voice_note_recorded_by_user_id_user_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_show_status_idx" ON "trade_show" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trade_show_starts_on_idx" ON "trade_show" USING btree ("starts_on");--> statement-breakpoint
CREATE INDEX "trade_show_vendor_show_id_idx" ON "trade_show_vendor" USING btree ("trade_show_id");--> statement-breakpoint
CREATE INDEX "trade_show_vendor_visited_idx" ON "trade_show_vendor" USING btree ("visited");--> statement-breakpoint
CREATE INDEX "trade_show_vendor_side_idx" ON "trade_show_vendor" USING btree ("side");--> statement-breakpoint
CREATE INDEX "trade_show_vendor_lead_id_idx" ON "trade_show_vendor" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "trade_show_vendor_supplier_lead_id_idx" ON "trade_show_vendor" USING btree ("supplier_lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_show_vendor_show_company_uniq" ON "trade_show_vendor" USING btree ("trade_show_id","company_name");--> statement-breakpoint
CREATE INDEX "trade_show_vendor_voice_note_vendor_id_idx" ON "trade_show_vendor_voice_note" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "trade_show_vendor_voice_note_created_at_idx" ON "trade_show_vendor_voice_note" USING btree ("created_at");