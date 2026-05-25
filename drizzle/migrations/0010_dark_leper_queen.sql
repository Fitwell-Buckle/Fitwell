CREATE TYPE "public"."production_stage" AS ENUM('supplier_po', 'stamping', 'edm', 'polishing', 'logo', 'plating', 'qc', 'packaging', 'complete');--> statement-breakpoint
CREATE SEQUENCE "public"."invoice_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."production_po_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE TABLE "admin_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"po_id" text,
	"line_item_id" text,
	"supplier_id" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"bank_name" text,
	"account_name" text,
	"account_number" text,
	"routing_number" text,
	"swift_bic" text,
	"iban" text,
	"instructions" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"customer_id" text,
	"price_tier_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "company_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text NOT NULL,
	"company_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"issued_date" date NOT NULL,
	"due_date" date,
	"notes" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_percent" real,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"source_po_id" text,
	"shopify_draft_order_id" text,
	"shopify_invoice_url" text,
	"sent_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "invoice_line_item" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"shopify_product_id" text,
	"shopify_variant_id" text,
	"source_line_item_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "price_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"discount_percent" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "production_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text,
	"line_item_id" text,
	"blob_url" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_attachment_one_parent" CHECK (("production_attachment"."po_id" is null) <> ("production_attachment"."line_item_id" is null))
);
--> statement-breakpoint
CREATE TABLE "production_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text,
	"line_item_id" text,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_comment_one_parent" CHECK (("production_comment"."po_id" is null) <> ("production_comment"."line_item_id" is null))
);
--> statement-breakpoint
CREATE TABLE "production_po" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"shopify_po_number" text NOT NULL,
	"issued_date" date NOT NULL,
	"expected_delivery_date" date,
	"lock_stages_together" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"shopify_received_at" timestamp,
	"company_id" text,
	"shopify_location_id" text,
	"location_name" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "production_po_line_item" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"shopify_product_id" text,
	"shopify_variant_id" text,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_cost_cents" integer,
	"current_stage" "production_stage" DEFAULT 'supplier_po' NOT NULL,
	"expected_completion_date" date,
	"actual_completion_date" date,
	"shopify_received_at" timestamp,
	"customer_id" text,
	"order_line_item_id" text,
	"company_id" text,
	"shopify_location_id" text,
	"location_name" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "production_stage_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"stage" "production_stage" NOT NULL,
	"supplier_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "production_stage_event" (
	"id" text PRIMARY KEY NOT NULL,
	"line_item_id" text NOT NULL,
	"stage" "production_stage" NOT NULL,
	"entered_at" timestamp DEFAULT now() NOT NULL,
	"exited_at" timestamp,
	"triggered_by_user_id" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"contact_name" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "supplier_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "supplier_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "admin_notification" ADD CONSTRAINT "admin_notification_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_price_tier_id_price_tier_id_fk" FOREIGN KEY ("price_tier_id") REFERENCES "public"."price_tier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contact" ADD CONSTRAINT "company_contact_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_source_po_id_production_po_id_fk" FOREIGN KEY ("source_po_id") REFERENCES "public"."production_po"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_source_line_item_id_production_po_line_item_id_fk" FOREIGN KEY ("source_line_item_id") REFERENCES "public"."production_po_line_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachment" ADD CONSTRAINT "production_attachment_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachment" ADD CONSTRAINT "production_attachment_line_item_id_production_po_line_item_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."production_po_line_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachment" ADD CONSTRAINT "production_attachment_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comment" ADD CONSTRAINT "production_comment_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comment" ADD CONSTRAINT "production_comment_line_item_id_production_po_line_item_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."production_po_line_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comment" ADD CONSTRAINT "production_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po" ADD CONSTRAINT "production_po_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po" ADD CONSTRAINT "production_po_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD CONSTRAINT "production_po_line_item_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD CONSTRAINT "production_po_line_item_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD CONSTRAINT "production_po_line_item_order_line_item_id_order_line_item_id_fk" FOREIGN KEY ("order_line_item_id") REFERENCES "public"."order_line_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD CONSTRAINT "production_po_line_item_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stage_assignment" ADD CONSTRAINT "production_stage_assignment_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stage_assignment" ADD CONSTRAINT "production_stage_assignment_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stage_event" ADD CONSTRAINT "production_stage_event_line_item_id_production_po_line_item_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."production_po_line_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stage_event" ADD CONSTRAINT "production_stage_event_triggered_by_user_id_user_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_contact" ADD CONSTRAINT "supplier_contact_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notification_read_at_idx" ON "admin_notification" USING btree ("read_at");--> statement-breakpoint
CREATE INDEX "company_price_tier_id_idx" ON "company" USING btree ("price_tier_id");--> statement-breakpoint
CREATE INDEX "company_customer_id_idx" ON "company" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_contact_email_idx" ON "company_contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "company_contact_company_id_idx" ON "company_contact" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoice_company_id_idx" ON "invoice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoice_status_idx" ON "invoice" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_source_po_id_idx" ON "invoice" USING btree ("source_po_id");--> statement-breakpoint
CREATE INDEX "invoice_line_item_invoice_id_idx" ON "invoice_line_item" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "production_attachment_po_id_idx" ON "production_attachment" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "production_attachment_line_item_id_idx" ON "production_attachment" USING btree ("line_item_id");--> statement-breakpoint
CREATE INDEX "production_comment_po_id_idx" ON "production_comment" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "production_comment_line_item_id_idx" ON "production_comment" USING btree ("line_item_id");--> statement-breakpoint
CREATE INDEX "production_po_supplier_id_idx" ON "production_po" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "production_po_status_idx" ON "production_po" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_po_company_id_idx" ON "production_po" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "production_li_po_id_idx" ON "production_po_line_item" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "production_li_customer_id_idx" ON "production_po_line_item" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "production_li_order_line_item_id_idx" ON "production_po_line_item" USING btree ("order_line_item_id");--> statement-breakpoint
CREATE INDEX "production_li_current_stage_idx" ON "production_po_line_item" USING btree ("current_stage");--> statement-breakpoint
CREATE INDEX "production_li_company_id_idx" ON "production_po_line_item" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_assignment_po_stage_idx" ON "production_stage_assignment" USING btree ("po_id","stage");--> statement-breakpoint
CREATE INDEX "stage_assignment_supplier_idx" ON "production_stage_assignment" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "production_stage_event_line_item_id_idx" ON "production_stage_event" USING btree ("line_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_contact_email_idx" ON "supplier_contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "supplier_contact_supplier_id_idx" ON "supplier_contact" USING btree ("supplier_id");