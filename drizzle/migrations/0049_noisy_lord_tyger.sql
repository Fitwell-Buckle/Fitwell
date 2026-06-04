ALTER TABLE "order" ADD COLUMN "total_tax" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "total_discounts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "total_shipping" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "total_refunded" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "cancelled_at" timestamp;