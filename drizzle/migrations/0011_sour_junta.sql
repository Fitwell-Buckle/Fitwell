CREATE SEQUENCE "public"."influencer_order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100 CACHE 1;--> statement-breakpoint
CREATE TABLE "influencer" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"handle" text,
	"platform" text,
	"contact_name" text,
	"contact_email" text,
	"customer_id" text,
	"assigned_collection_ids" text[],
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "influencer_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"influencer_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "influencer_order" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"influencer_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"issued_date" date NOT NULL,
	"content_due_date" date,
	"published_at" date,
	"affiliate_link" text,
	"notes" text,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_percent" real,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"shopify_draft_order_id" text,
	"shopify_invoice_url" text,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "influencer_order_line_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"shopify_product_id" text,
	"shopify_variant_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "influencer" ADD CONSTRAINT "influencer_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_contact" ADD CONSTRAINT "influencer_contact_influencer_id_influencer_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_order" ADD CONSTRAINT "influencer_order_influencer_id_influencer_id_fk" FOREIGN KEY ("influencer_id") REFERENCES "public"."influencer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_order_line_item" ADD CONSTRAINT "influencer_order_line_item_order_id_influencer_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."influencer_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "influencer_customer_id_idx" ON "influencer" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "influencer_contact_email_idx" ON "influencer_contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "influencer_contact_influencer_id_idx" ON "influencer_contact" USING btree ("influencer_id");--> statement-breakpoint
CREATE INDEX "influencer_order_influencer_id_idx" ON "influencer_order" USING btree ("influencer_id");--> statement-breakpoint
CREATE INDEX "influencer_order_status_idx" ON "influencer_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "influencer_order_content_due_date_idx" ON "influencer_order" USING btree ("content_due_date");--> statement-breakpoint
CREATE INDEX "influencer_order_line_item_order_id_idx" ON "influencer_order_line_item" USING btree ("order_id");