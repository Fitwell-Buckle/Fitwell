CREATE TABLE "creator_outreach" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'no_reply' NOT NULL,
	"terms" text,
	"first_contact_at" timestamp,
	"last_contact_at" timestamp,
	"next_followup_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_outreach_event" (
	"id" text PRIMARY KEY NOT NULL,
	"outreach_id" text NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"direction" text DEFAULT 'note' NOT NULL,
	"summary" text NOT NULL,
	"body" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "influencer_order" ADD COLUMN "shopify_order_id" text;--> statement-breakpoint
ALTER TABLE "influencer_order" ADD COLUMN "shipped_at" timestamp;--> statement-breakpoint
ALTER TABLE "influencer_order" ADD COLUMN "delivered_at" timestamp;--> statement-breakpoint
ALTER TABLE "influencer_order" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "influencer_order" ADD COLUMN "tracking_url" text;--> statement-breakpoint
ALTER TABLE "influencer_order" ADD COLUMN "expected_platform" text;--> statement-breakpoint
ALTER TABLE "creator_outreach" ADD CONSTRAINT "creator_outreach_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_outreach_event" ADD CONSTRAINT "creator_outreach_event_outreach_id_creator_outreach_id_fk" FOREIGN KEY ("outreach_id") REFERENCES "public"."creator_outreach"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_outreach_creator_id_idx" ON "creator_outreach" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_outreach_next_followup_idx" ON "creator_outreach" USING btree ("next_followup_at");--> statement-breakpoint
CREATE INDEX "creator_outreach_event_outreach_id_idx" ON "creator_outreach_event" USING btree ("outreach_id");--> statement-breakpoint
-- Lifecycle vocabulary (2026-06-12): "committed" → "agreed" to match the
-- relationship stages (prospect → contacted → agreed → active).
UPDATE "creator" SET "status" = 'agreed' WHERE "status" = 'committed';
