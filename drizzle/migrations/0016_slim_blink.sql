CREATE TABLE "production_supplier_line_cost" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"line_item_id" text NOT NULL,
	"unit_cost_cents" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "production_supplier_line_cost" ADD CONSTRAINT "production_supplier_line_cost_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_supplier_line_cost" ADD CONSTRAINT "production_supplier_line_cost_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_supplier_line_cost" ADD CONSTRAINT "production_supplier_line_cost_line_item_id_production_po_line_item_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."production_po_line_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_line_cost_po_supplier_line_idx" ON "production_supplier_line_cost" USING btree ("po_id","supplier_id","line_item_id");--> statement-breakpoint
CREATE INDEX "supplier_line_cost_po_idx" ON "production_supplier_line_cost" USING btree ("po_id");