CREATE TABLE "production_stage_checkin" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"stage" text NOT NULL,
	"stage_entered_at" timestamp NOT NULL,
	"threshold_pct" integer NOT NULL,
	"prompted_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"note" text,
	"escalated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "production_settings" ADD COLUMN "stage_checkin_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "production_settings" ADD COLUMN "stage_checkin_thresholds" jsonb DEFAULT '[50,75,95]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "production_stage_checkin" ADD CONSTRAINT "production_stage_checkin_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stage_checkin" ADD CONSTRAINT "production_stage_checkin_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stage_checkin_instance_idx" ON "production_stage_checkin" USING btree ("po_id","supplier_id","stage","stage_entered_at","threshold_pct");--> statement-breakpoint
CREATE INDEX "stage_checkin_supplier_idx" ON "production_stage_checkin" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "stage_checkin_po_idx" ON "production_stage_checkin" USING btree ("po_id");