CREATE TABLE "lead_card_image" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_card_image" ADD CONSTRAINT "lead_card_image_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_card_image" ADD CONSTRAINT "lead_card_image_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_card_image_lead_id_idx" ON "lead_card_image" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_card_image_uploaded_at_idx" ON "lead_card_image" USING btree ("uploaded_at");