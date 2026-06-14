CREATE TABLE "supplier_lead" (
	"id" text PRIMARY KEY NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"captured_by_user_id" text,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"title" text,
	"company_name" text,
	"website" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"region" text,
	"postal_code" text,
	"country" text,
	"supplier_type" text,
	"notes" text,
	"card_image_url" text,
	"card_raw_text" text,
	"ocr_confidence" jsonb,
	"supplier_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_lead_card_image" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_lead_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_lead" ADD CONSTRAINT "supplier_lead_captured_by_user_id_user_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_lead" ADD CONSTRAINT "supplier_lead_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_lead_card_image" ADD CONSTRAINT "supplier_lead_card_image_supplier_lead_id_supplier_lead_id_fk" FOREIGN KEY ("supplier_lead_id") REFERENCES "public"."supplier_lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_lead_card_image" ADD CONSTRAINT "supplier_lead_card_image_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_lead_email_idx" ON "supplier_lead" USING btree ("email");--> statement-breakpoint
CREATE INDEX "supplier_lead_status_idx" ON "supplier_lead" USING btree ("status");--> statement-breakpoint
CREATE INDEX "supplier_lead_supplier_id_idx" ON "supplier_lead" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_lead_captured_at_idx" ON "supplier_lead" USING btree ("captured_at");--> statement-breakpoint
CREATE INDEX "supplier_lead_card_image_lead_id_idx" ON "supplier_lead_card_image" USING btree ("supplier_lead_id");--> statement-breakpoint
CREATE INDEX "supplier_lead_card_image_uploaded_at_idx" ON "supplier_lead_card_image" USING btree ("uploaded_at");