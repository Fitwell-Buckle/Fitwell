ALTER TABLE "production_po" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD COLUMN "shopify_location_id" text;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD COLUMN "location_name" text;--> statement-breakpoint
ALTER TABLE "production_po" ADD CONSTRAINT "production_po_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_po_line_item" ADD CONSTRAINT "production_po_line_item_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_po_company_id_idx" ON "production_po" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "production_li_company_id_idx" ON "production_po_line_item" USING btree ("company_id");