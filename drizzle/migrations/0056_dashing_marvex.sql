CREATE TABLE "production_po_stage_estimate" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"stage" text NOT NULL,
	"days" integer NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "production_po_stage_estimate" ADD CONSTRAINT "production_po_stage_estimate_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "po_stage_estimate_po_stage_idx" ON "production_po_stage_estimate" USING btree ("po_id","stage");