ALTER TABLE "outbound_message" ADD COLUMN "scheduled_at" timestamp;--> statement-breakpoint
CREATE INDEX "outbound_message_scheduled_at_idx" ON "outbound_message" USING btree ("scheduled_at");