CREATE TABLE "dashboard_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"return_label_cost_cents" integer DEFAULT 700 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
