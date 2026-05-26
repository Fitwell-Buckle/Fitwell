ALTER TABLE "company" ADD COLUMN "deposit_percent" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "deposit_percent" real;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "deposit_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "deposit_paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "shopify_balance_draft_order_id" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "shopify_balance_invoice_url" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "balance_paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "fulfilled_at" timestamp;