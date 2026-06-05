CREATE TABLE "attribution_survey_response" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'grapevine' NOT NULL,
	"provider_response_id" text NOT NULL,
	"survey_code" text,
	"survey_name" text,
	"surface" text,
	"order_id" text,
	"shopify_order_id" text,
	"customer_email" text,
	"question_key" text NOT NULL,
	"raw_answer" text,
	"is_other_text" boolean DEFAULT false,
	"channel_hint" text,
	"channel_detail" text,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "attribution_survey_response" ADD CONSTRAINT "attribution_survey_response_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asr_provider_response_id_idx" ON "attribution_survey_response" USING btree ("provider","provider_response_id");--> statement-breakpoint
CREATE INDEX "asr_order_id_idx" ON "attribution_survey_response" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "asr_shopify_order_id_idx" ON "attribution_survey_response" USING btree ("shopify_order_id");--> statement-breakpoint
CREATE INDEX "asr_channel_hint_idx" ON "attribution_survey_response" USING btree ("channel_hint");--> statement-breakpoint
CREATE INDEX "asr_responded_at_idx" ON "attribution_survey_response" USING btree ("responded_at");