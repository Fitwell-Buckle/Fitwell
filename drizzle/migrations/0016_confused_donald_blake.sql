CREATE TABLE "supplier_contact" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "supplier_contact" ADD CONSTRAINT "supplier_contact_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_contact_email_idx" ON "supplier_contact" USING btree ("email");--> statement-breakpoint
CREATE INDEX "supplier_contact_supplier_id_idx" ON "supplier_contact" USING btree ("supplier_id");