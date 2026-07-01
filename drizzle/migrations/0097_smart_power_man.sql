CREATE TABLE "creator_payout" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"period" text,
	"amount_cents" integer NOT NULL,
	"method" text,
	"paid_at" timestamp,
	"note" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "offer_tier" text;--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "commission_rate_pct" real;--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "payout_email" text;--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "tax_form_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "creator" ADD COLUMN "first_sale_at" timestamp;--> statement-breakpoint
ALTER TABLE "creator_payout" ADD CONSTRAINT "creator_payout_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_payout_creator_id_idx" ON "creator_payout" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_offer_tier_idx" ON "creator" USING btree ("offer_tier");