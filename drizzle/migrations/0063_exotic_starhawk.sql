ALTER TABLE "company" ADD COLUMN "allow_wire_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "payment_method" text DEFAULT 'card' NOT NULL;