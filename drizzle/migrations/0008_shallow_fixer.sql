CREATE TYPE "public"."production_stage" AS ENUM('supplier_po', 'stamping', 'edm', 'polishing', 'logo', 'plating', 'qc', 'packaging', 'complete');--> statement-breakpoint
CREATE TABLE "production_po" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"shopify_po_number" text NOT NULL,
	"issued_date" date NOT NULL,
	"expected_delivery_date" date,
	"lock_stages_together" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"shopify_received_at" timestamp,
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
	"customer_id" text,
	"order_line_item_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
ALTER TABLE "user" ADD COLUMN "supplier_id" text;--> statement-breakpoint
ALTER TABLE "production_po" ADD CONSTRAINT "production_po_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD CONSTRAINT "production_po_line_item_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD CONSTRAINT "production_po_line_item_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD CONSTRAINT "production_po_line_item_order_line_item_id_order_line_item_id_fk" FOREIGN KEY ("order_line_item_id") REFERENCES "public"."order_line_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stage_event" ADD CONSTRAINT "production_stage_event_line_item_id_production_po_line_item_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."production_po_line_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stage_event" ADD CONSTRAINT "production_stage_event_triggered_by_user_id_user_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_po_supplier_id_idx" ON "production_po" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "production_po_status_idx" ON "production_po" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_li_po_id_idx" ON "production_po_line_item" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "production_li_customer_id_idx" ON "production_po_line_item" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "production_li_order_line_item_id_idx" ON "production_po_line_item" USING btree ("order_line_item_id");--> statement-breakpoint
CREATE INDEX "production_li_current_stage_idx" ON "production_po_line_item" USING btree ("current_stage");--> statement-breakpoint
CREATE INDEX "production_stage_event_line_item_id_idx" ON "production_stage_event" USING btree ("line_item_id");