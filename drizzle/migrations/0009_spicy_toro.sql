CREATE TABLE "google_ads_adgroup_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"campaign_id" text,
	"campaign_name" text,
	"ad_group_id" text,
	"ad_group_name" text,
	"platform" text,
	"impressions" integer DEFAULT 0,
	"search_impression_share" real,
	"search_budget_lost_is" real,
	"search_rank_lost_is" real,
	"search_absolute_top_is" real
);
--> statement-breakpoint
CREATE TABLE "meta_adset_audience" (
	"adset_id" text PRIMARY KEY NOT NULL,
	"adset_name" text,
	"audience_lower_bound" integer,
	"audience_upper_bound" integer,
	"snapshot_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_ads_daily" ADD COLUMN "quality_ranking" text;--> statement-breakpoint
ALTER TABLE "meta_ads_daily" ADD COLUMN "engagement_ranking" text;--> statement-breakpoint
ALTER TABLE "meta_ads_daily" ADD COLUMN "conversion_ranking" text;--> statement-breakpoint
CREATE INDEX "google_ads_adgroup_daily_date_idx" ON "google_ads_adgroup_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "google_ads_adgroup_daily_lookup_idx" ON "google_ads_adgroup_daily" USING btree ("campaign_id","ad_group_id");