ALTER TABLE "order" ADD COLUMN "shipping_city" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "shipping_province" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "shipping_province_code" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "shipping_country" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "shipping_country_code" text;--> statement-breakpoint
CREATE INDEX "order_shipping_country_idx" ON "order" USING btree ("shipping_country_code");