CREATE TABLE IF NOT EXISTS "production_stage_def" (
	"key" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "production_stage_def" ("key", "label", "position", "active") VALUES
	('supplier_po', 'Supplier PO', 0, true),
	('stamping', 'Raw Material Stamping', 1, true),
	('edm', 'EDM', 2, true),
	('polishing', 'Polishing', 3, true),
	('logo', 'Logo', 4, true),
	('plating', 'Plating', 5, true),
	('qc', 'QC', 6, true),
	('packaging', 'Packaging', 7, true),
	('complete', 'Complete', 8, true)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
DO $$
BEGIN
	IF to_regclass('public.production_stage_label') IS NOT NULL THEN
		UPDATE "production_stage_def" d
		SET "label" = l."label"
		FROM "production_stage_label" l
		WHERE d."key" = l."stage"::text AND length(trim(l."label")) > 0;
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "production_po_line_item" ALTER COLUMN "current_stage" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "production_po_line_item" ALTER COLUMN "current_stage" SET DATA TYPE text USING "current_stage"::text;
--> statement-breakpoint
ALTER TABLE "production_po_line_item" ALTER COLUMN "current_stage" SET DEFAULT 'supplier_po';
--> statement-breakpoint
ALTER TABLE "production_stage_event" ALTER COLUMN "stage" SET DATA TYPE text USING "stage"::text;
--> statement-breakpoint
ALTER TABLE "production_stage_assignment" ALTER COLUMN "stage" SET DATA TYPE text USING "stage"::text;
--> statement-breakpoint
DROP TABLE IF EXISTS "production_stage_label";
