ALTER TABLE "order" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "lead_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_is_sample_idx" ON "order" USING btree ("is_sample","processed_at");--> statement-breakpoint
CREATE INDEX "order_lead_id_idx" ON "order" USING btree ("lead_id");