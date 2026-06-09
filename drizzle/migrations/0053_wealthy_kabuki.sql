CREATE TABLE "production_po_stage_eta" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"stage" text NOT NULL,
	"target_end_date" date NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "production_po_stage_eta" ADD CONSTRAINT "production_po_stage_eta_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "po_stage_eta_po_stage_idx" ON "production_po_stage_eta" USING btree ("po_id","stage");