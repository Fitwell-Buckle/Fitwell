ALTER TABLE "customer" ADD COLUMN "fw_distinct_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fw_distinct_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "link_method" text;--> statement-breakpoint
ALTER TABLE "utm_attribution" ADD COLUMN "gclid" text;--> statement-breakpoint
ALTER TABLE "utm_attribution" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "utm_attribution" ADD COLUMN "fw_distinct_id" text;--> statement-breakpoint
ALTER TABLE "utm_attribution" ADD COLUMN "converted" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "utm_attribution" ADD COLUMN "converted_at" timestamp;--> statement-breakpoint
CREATE INDEX "customer_fw_distinct_id_idx" ON "customer" USING btree ("fw_distinct_id");--> statement-breakpoint
CREATE INDEX "order_fw_distinct_id_idx" ON "order" USING btree ("fw_distinct_id");--> statement-breakpoint
CREATE INDEX "utm_fw_distinct_id_idx" ON "utm_attribution" USING btree ("fw_distinct_id");--> statement-breakpoint
CREATE UNIQUE INDEX "utm_session_id_idx" ON "utm_attribution" USING btree ("session_id");