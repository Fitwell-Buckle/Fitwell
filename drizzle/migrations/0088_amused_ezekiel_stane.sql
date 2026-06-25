ALTER TABLE "prototype_supplier" ADD COLUMN "rfq_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "prototype_supplier" ADD COLUMN "quote_unit_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "prototype_supplier" ADD COLUMN "quote_lead_time_days" integer;--> statement-breakpoint
ALTER TABLE "prototype_supplier" ADD COLUMN "quote_moq" integer;--> statement-breakpoint
ALTER TABLE "prototype_supplier" ADD COLUMN "quote_setup_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "prototype_supplier" ADD COLUMN "quote_notes" text;--> statement-breakpoint
ALTER TABLE "prototype_supplier" ADD COLUMN "quote_received_at" timestamp;