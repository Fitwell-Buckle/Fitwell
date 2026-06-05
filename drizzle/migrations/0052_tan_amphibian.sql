ALTER TABLE "attribution_survey_response" ADD COLUMN "platform_hint" text;--> statement-breakpoint
CREATE INDEX "asr_platform_hint_idx" ON "attribution_survey_response" USING btree ("platform_hint");