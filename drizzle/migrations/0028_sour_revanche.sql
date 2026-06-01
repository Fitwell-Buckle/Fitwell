ALTER TABLE "lead" ADD COLUMN "replied_at" timestamp;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD COLUMN "sequence_step" integer DEFAULT 1 NOT NULL;