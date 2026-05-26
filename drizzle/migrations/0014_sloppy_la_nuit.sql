ALTER TABLE "production_po" ADD COLUMN "parent_po_id" text;--> statement-breakpoint
ALTER TABLE "production_po" ADD COLUMN "po_suffix" text;--> statement-breakpoint
CREATE INDEX "production_po_parent_po_id_idx" ON "production_po" USING btree ("parent_po_id");