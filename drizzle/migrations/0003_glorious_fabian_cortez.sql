CREATE TABLE "meta_ads_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"campaign_name" text,
	"campaign_id" text,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"cost" integer DEFAULT 0,
	"conversions" real,
	"conversion_value" real,
	"reach" integer DEFAULT 0,
	"frequency" real
);
--> statement-breakpoint
CREATE INDEX "meta_ads_daily_date_idx" ON "meta_ads_daily" USING btree ("date");