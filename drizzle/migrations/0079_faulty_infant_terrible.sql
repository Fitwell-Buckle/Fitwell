ALTER TABLE "creator" ADD COLUMN "source" text;--> statement-breakpoint
CREATE INDEX "creator_source_idx" ON "creator" USING btree ("source");