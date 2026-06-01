ALTER TABLE "admin_notification" ADD COLUMN "lead_id" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "replies_seen_at" timestamp;