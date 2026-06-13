CREATE TABLE "influencer_order_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "influencer_order" ADD COLUMN "ship_to" jsonb;--> statement-breakpoint
ALTER TABLE "influencer_order_line_item" ADD COLUMN "ship_to" jsonb;--> statement-breakpoint
ALTER TABLE "influencer_order_attachment" ADD CONSTRAINT "influencer_order_attachment_order_id_influencer_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."influencer_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_order_attachment" ADD CONSTRAINT "influencer_order_attachment_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "influencer_order_attachment_order_id_idx" ON "influencer_order_attachment" USING btree ("order_id");