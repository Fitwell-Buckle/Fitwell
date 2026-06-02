ALTER TABLE "customer" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_company_id_idx" ON "customer" USING btree ("company_id");--> statement-breakpoint
UPDATE "lead" SET "stage" = 'lead' WHERE "stage" NOT IN ('lead','sample','customer');
