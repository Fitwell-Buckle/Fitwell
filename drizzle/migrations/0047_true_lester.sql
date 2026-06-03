ALTER TABLE "outbound_message" ADD COLUMN "track_token" text;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD COLUMN "open_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD COLUMN "first_opened_at" timestamp;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD COLUMN "last_opened_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_message_track_token_idx" ON "outbound_message" USING btree ("track_token");