CREATE TABLE "order_refund_line" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"shopify_refund_id" text,
	"shopify_line_item_id" text,
	"shopify_product_id" text,
	"shopify_variant_id" text,
	"title" text,
	"variant_title" text,
	"sku" text,
	"quantity" integer DEFAULT 0,
	"subtotal_cents" integer DEFAULT 0,
	"tax_cents" integer DEFAULT 0,
	"refunded_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "order_refund_line" ADD CONSTRAINT "order_refund_line_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_refund_line_order_id_idx" ON "order_refund_line" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_refund_line_product_id_idx" ON "order_refund_line" USING btree ("shopify_product_id");--> statement-breakpoint
CREATE INDEX "order_refund_line_refunded_at_idx" ON "order_refund_line" USING btree ("refunded_at");