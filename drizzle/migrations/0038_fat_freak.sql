ALTER TABLE "supplier" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD COLUMN "supplier_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_message" ADD CONSTRAINT "whatsapp_message_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_message_supplier_id_idx" ON "whatsapp_message" USING btree ("supplier_id");