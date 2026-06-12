ALTER TABLE "creator" ADD COLUMN "vetting_status" text DEFAULT 'unreviewed' NOT NULL;--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "score_boost" real DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "creator_vetting_status_idx" ON "creator" USING btree ("vetting_status");