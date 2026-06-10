CREATE TABLE "order_discount_code" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"code" text NOT NULL,
	"code_raw" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"type" text
);
--> statement-breakpoint
ALTER TABLE "order_discount_code" ADD CONSTRAINT "order_discount_code_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_discount_code_order_code_idx" ON "order_discount_code" USING btree ("order_id","code");--> statement-breakpoint
CREATE INDEX "order_discount_code_code_idx" ON "order_discount_code" USING btree ("code");