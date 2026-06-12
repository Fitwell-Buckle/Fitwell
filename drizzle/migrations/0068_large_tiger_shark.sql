CREATE TABLE "creator_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"gift_order_id" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"storage_url" text NOT NULL,
	"asset_type" text DEFAULT 'edited' NOT NULL,
	"rights_tier" text DEFAULT 'organic_only' NOT NULL,
	"rights_expires_at" timestamp,
	"usage_notes" text,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_asset" ADD CONSTRAINT "creator_asset_gift_order_id_influencer_order_id_fk" FOREIGN KEY ("gift_order_id") REFERENCES "public"."influencer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_asset_creator_id_idx" ON "creator_asset" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_asset_rights_expires_idx" ON "creator_asset" USING btree ("rights_expires_at");