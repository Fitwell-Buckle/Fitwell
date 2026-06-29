CREATE TABLE "shipment" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"shopify_fulfillment_id" text,
	"carrier" text,
	"service" text,
	"tracking_number" text,
	"tracking_url" text,
	"status" text,
	"shipment_status" text,
	"shipped_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_shopify_fulfillment_id_unique" UNIQUE("shopify_fulfillment_id")
);
--> statement-breakpoint
CREATE TABLE "shipping_charge" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"bill_number" text NOT NULL,
	"order_name" text NOT NULL,
	"charge_category" text NOT NULL,
	"description" text,
	"service" text,
	"destination" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"charged_at" timestamp,
	"source" text DEFAULT 'shopify_billing_csv' NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shipment" ADD CONSTRAINT "shipment_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipping_charge" ADD CONSTRAINT "shipping_charge_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_shopify_fulfillment_id_idx" ON "shipment" USING btree ("shopify_fulfillment_id");--> statement-breakpoint
CREATE INDEX "shipment_order_id_idx" ON "shipment" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipment_tracking_number_idx" ON "shipment" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "shipping_charge_order_id_idx" ON "shipping_charge" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipping_charge_bill_number_idx" ON "shipping_charge" USING btree ("bill_number");--> statement-breakpoint
CREATE INDEX "shipping_charge_order_name_idx" ON "shipping_charge" USING btree ("order_name");