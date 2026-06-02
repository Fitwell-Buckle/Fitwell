CREATE TABLE "lead_followup_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"nudge_after_days" integer DEFAULT 14 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
