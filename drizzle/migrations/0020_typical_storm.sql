CREATE TABLE "billing_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"bank_name" text,
	"account_name" text,
	"account_number" text,
	"routing_number" text,
	"swift_bic" text,
	"iban" text,
	"instructions" text,
	"updated_at" timestamp DEFAULT now()
);
