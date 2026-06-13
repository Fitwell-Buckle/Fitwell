ALTER TABLE "creator" ADD COLUMN "lead_id" text;--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "creator" ADD CONSTRAINT "creator_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator" ADD CONSTRAINT "creator_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_lead_id_idx" ON "creator" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "creator_company_id_idx" ON "creator" USING btree ("company_id");