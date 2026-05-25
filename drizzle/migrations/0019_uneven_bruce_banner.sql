CREATE SEQUENCE "public"."invoice_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
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
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_source_po_id_production_po_id_fk" FOREIGN KEY ("source_po_id") REFERENCES "public"."production_po"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_item" ADD CONSTRAINT "invoice_line_item_source_line_item_id_production_po_line_item_id_fk" FOREIGN KEY ("source_line_item_id") REFERENCES "public"."production_po_line_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_company_id_idx" ON "invoice" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "invoice_status_idx" ON "invoice" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoice_source_po_id_idx" ON "invoice" USING btree ("source_po_id");--> statement-breakpoint
CREATE INDEX "invoice_line_item_invoice_id_idx" ON "invoice_line_item" USING btree ("invoice_id");