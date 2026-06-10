CREATE TABLE "newsletter_article" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"published_at" timestamp,
	"content_hash" text NOT NULL,
	"summary" text,
	"segment" text,
	"type" text,
	"image_url" text,
	"included_in_campaign_id" text,
	"dropped_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"klaviyo_campaign_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp,
	"subject" text NOT NULL,
	"article_count" integer NOT NULL,
	"html_hash" text NOT NULL,
	"recipient_count" integer,
	"open_count" integer,
	"click_count" integer,
	"unsubscribe_count" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_source" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"feed_url" text,
	"scrape_url" text,
	"requires_playwright" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "newsletter_article" ADD CONSTRAINT "newsletter_article_source_id_newsletter_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."newsletter_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_article" ADD CONSTRAINT "newsletter_article_included_in_campaign_id_newsletter_campaign_id_fk" FOREIGN KEY ("included_in_campaign_id") REFERENCES "public"."newsletter_campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_article_url_uniq" ON "newsletter_article" USING btree ("url");--> statement-breakpoint
CREATE INDEX "newsletter_article_source_id_idx" ON "newsletter_article" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "newsletter_article_content_hash_idx" ON "newsletter_article" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "newsletter_article_campaign_idx" ON "newsletter_article" USING btree ("included_in_campaign_id");--> statement-breakpoint
CREATE INDEX "newsletter_article_created_at_idx" ON "newsletter_article" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_campaign_klaviyo_id_uniq" ON "newsletter_campaign" USING btree ("klaviyo_campaign_id");--> statement-breakpoint
CREATE INDEX "newsletter_campaign_created_at_idx" ON "newsletter_campaign" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_source_slug_uniq" ON "newsletter_source" USING btree ("slug");