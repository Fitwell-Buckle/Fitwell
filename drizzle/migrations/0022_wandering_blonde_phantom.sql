CREATE TABLE "admin_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"po_id" text,
	"line_item_id" text,
	"supplier_id" text,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_stage_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text NOT NULL,
	"stage" "production_stage" NOT NULL,
	"supplier_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "admin_notification" ADD CONSTRAINT "admin_notification_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stage_assignment" ADD CONSTRAINT "production_stage_assignment_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_stage_assignment" ADD CONSTRAINT "production_stage_assignment_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notification_read_at_idx" ON "admin_notification" USING btree ("read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_assignment_po_stage_idx" ON "production_stage_assignment" USING btree ("po_id","stage");--> statement-breakpoint
CREATE INDEX "stage_assignment_supplier_idx" ON "production_stage_assignment" USING btree ("supplier_id");