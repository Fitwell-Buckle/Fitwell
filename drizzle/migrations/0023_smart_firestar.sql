CREATE TABLE "lead" (
	"id" text PRIMARY KEY NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"captured_by_user_id" text,
	"first_name" text,
	"last_name" text,
	"email" text,
	"phone" text,
	"title" text,
	"company_name" text,
	"stage" text DEFAULT 'prospect' NOT NULL,
	"persona_tag" text,
	"source_channel" text NOT NULL,
	"tradeshow_id" text,
	"owner_user_id" text,
	"notes" text,
	"card_image_url" text,
	"card_raw_text" text,
	"ocr_confidence" jsonb,
	"company_id" text,
	"customer_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tradeshow" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"starts_on" date,
	"ends_on" date,
	"channel" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_captured_by_user_id_user_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_tradeshow_id_tradeshow_id_fk" FOREIGN KEY ("tradeshow_id") REFERENCES "public"."tradeshow"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_email_idx" ON "lead" USING btree ("email");--> statement-breakpoint
CREATE INDEX "lead_stage_idx" ON "lead" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "lead_source_channel_idx" ON "lead" USING btree ("source_channel");--> statement-breakpoint
CREATE INDEX "lead_status_idx" ON "lead" USING btree ("status");--> statement-breakpoint
CREATE INDEX "lead_tradeshow_id_idx" ON "lead" USING btree ("tradeshow_id");--> statement-breakpoint
CREATE INDEX "lead_owner_user_id_idx" ON "lead" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "lead_company_id_idx" ON "lead" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "lead_customer_id_idx" ON "lead" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "lead_captured_at_idx" ON "lead" USING btree ("captured_at");