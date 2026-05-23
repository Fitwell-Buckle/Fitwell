ALTER TABLE "company" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_customer_id_idx" ON "company" USING btree ("customer_id");