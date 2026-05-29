CREATE TABLE "customer_address" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"shopify_address_id" text,
	"first_name" text,
	"last_name" text,
	"company" text,
	"address1" text,
	"address2" text,
	"city" text,
	"province" text,
	"province_code" text,
	"country" text,
	"country_code" text,
	"zip" text,
	"phone" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "customer_address" ADD CONSTRAINT "customer_address_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_address_customer_id_idx" ON "customer_address" USING btree ("customer_id");