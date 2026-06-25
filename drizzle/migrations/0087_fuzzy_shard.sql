CREATE TABLE "prototype_supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"prototype_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "prototype_supplier" ADD CONSTRAINT "prototype_supplier_prototype_id_prototype_id_fk" FOREIGN KEY ("prototype_id") REFERENCES "public"."prototype"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_supplier" ADD CONSTRAINT "prototype_supplier_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prototype_supplier_pair_idx" ON "prototype_supplier" USING btree ("prototype_id","supplier_id");--> statement-breakpoint
CREATE INDEX "prototype_supplier_prototype_id_idx" ON "prototype_supplier" USING btree ("prototype_id");--> statement-breakpoint
CREATE INDEX "prototype_supplier_supplier_id_idx" ON "prototype_supplier" USING btree ("supplier_id");--> statement-breakpoint
-- Backfill: every prototype that already has an (awarded) vendor joins the
-- candidate set, so existing prototypes show their vendor under the new model.
INSERT INTO "prototype_supplier" ("id", "prototype_id", "supplier_id")
SELECT gen_random_uuid(), "id", "supplier_id"
FROM "prototype"
WHERE "supplier_id" IS NOT NULL
ON CONFLICT ("prototype_id", "supplier_id") DO NOTHING;