CREATE TABLE "company" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"price_tier_id" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "price_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_price_tier_id_price_tier_id_fk" FOREIGN KEY ("price_tier_id") REFERENCES "public"."price_tier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_price_tier_id_idx" ON "company" USING btree ("price_tier_id");