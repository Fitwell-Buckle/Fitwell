CREATE TABLE "trade_show_vendor_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"title" text,
	"email" text,
	"phone" text,
	"notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"card_image_url" text,
	"card_raw_text" text,
	"ocr_confidence" jsonb,
	"captured_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_show_vendor_contact" ADD CONSTRAINT "trade_show_vendor_contact_vendor_id_trade_show_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."trade_show_vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_show_vendor_contact" ADD CONSTRAINT "trade_show_vendor_contact_captured_by_user_id_user_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_show_vendor_contact_vendor_id_idx" ON "trade_show_vendor_contact" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "trade_show_vendor_contact_email_idx" ON "trade_show_vendor_contact" USING btree ("email");