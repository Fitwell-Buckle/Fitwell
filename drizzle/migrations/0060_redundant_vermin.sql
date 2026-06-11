CREATE TABLE "production_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"eta_reminder_enabled" boolean DEFAULT true NOT NULL,
	"eta_reminder_interval_days" integer DEFAULT 2 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "eta_reminder_last_sent_at" timestamp;