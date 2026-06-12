CREATE TABLE "creator" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"primary_platform" text,
	"status" text DEFAULT 'prospect' NOT NULL,
	"cross_platform_fit" real,
	"burned_until_date" date,
	"customer_id" text,
	"assigned_collection_ids" text[],
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_discount_code" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"code" text NOT NULL,
	"code_raw" text NOT NULL,
	"shopify_price_rule_id" text,
	"shopify_discount_code_id" text,
	"percent_off" real,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "creator_email" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"email" text NOT NULL,
	"kind" text,
	"source" text,
	"verified_at" timestamp,
	"portal_access" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_platform" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_id" text NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"profile_url" text,
	"is_business_account" boolean,
	"is_verified" boolean,
	"external_url" text,
	"bio" text,
	"data_source" text,
	"watch_score" real,
	"watch_confidence" text,
	"fit_score" real,
	"fit_score_partial" boolean DEFAULT false,
	"last_refreshed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creator_post" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_platform_id" text NOT NULL,
	"gift_order_id" text,
	"post_url" text NOT NULL,
	"posted_at" timestamp,
	"caption" text,
	"likes" integer,
	"comments" integer,
	"views" integer,
	"mentioned_us" boolean DEFAULT false NOT NULL,
	"used_code" boolean DEFAULT false NOT NULL,
	"detected_at" timestamp DEFAULT now(),
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_stats_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_platform_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"followers" integer,
	"engagement_rate_pct" real,
	"avg_likes" real,
	"avg_comments" real,
	"avg_views" real,
	"last_post_date" date,
	"posts_in_window" integer
);
--> statement-breakpoint
ALTER TABLE "influencer" ADD COLUMN "creator_id" text;--> statement-breakpoint
ALTER TABLE "influencer_order" ADD COLUMN "creator_id" text;--> statement-breakpoint
ALTER TABLE "creator" ADD CONSTRAINT "creator_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_discount_code" ADD CONSTRAINT "creator_discount_code_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_email" ADD CONSTRAINT "creator_email_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_platform" ADD CONSTRAINT "creator_platform_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_post" ADD CONSTRAINT "creator_post_creator_platform_id_creator_platform_id_fk" FOREIGN KEY ("creator_platform_id") REFERENCES "public"."creator_platform"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_post" ADD CONSTRAINT "creator_post_gift_order_id_influencer_order_id_fk" FOREIGN KEY ("gift_order_id") REFERENCES "public"."influencer_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_stats_daily" ADD CONSTRAINT "creator_stats_daily_creator_platform_id_creator_platform_id_fk" FOREIGN KEY ("creator_platform_id") REFERENCES "public"."creator_platform"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_status_idx" ON "creator" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creator_cross_platform_fit_idx" ON "creator" USING btree ("cross_platform_fit");--> statement-breakpoint
CREATE INDEX "creator_customer_id_idx" ON "creator" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_discount_code_code_idx" ON "creator_discount_code" USING btree ("code");--> statement-breakpoint
CREATE INDEX "creator_discount_code_creator_id_idx" ON "creator_discount_code" USING btree ("creator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_email_creator_email_idx" ON "creator_email" USING btree ("creator_id","email");--> statement-breakpoint
CREATE INDEX "creator_email_email_idx" ON "creator_email" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_platform_platform_handle_idx" ON "creator_platform" USING btree ("platform","handle");--> statement-breakpoint
CREATE INDEX "creator_platform_creator_id_idx" ON "creator_platform" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_platform_fit_score_idx" ON "creator_platform" USING btree ("fit_score");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_post_post_url_idx" ON "creator_post" USING btree ("post_url");--> statement-breakpoint
CREATE INDEX "creator_post_creator_platform_id_idx" ON "creator_post" USING btree ("creator_platform_id");--> statement-breakpoint
CREATE INDEX "creator_post_gift_order_id_idx" ON "creator_post" USING btree ("gift_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_stats_daily_platform_date_idx" ON "creator_stats_daily" USING btree ("creator_platform_id","snapshot_date");--> statement-breakpoint
ALTER TABLE "influencer" ADD CONSTRAINT "influencer_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "influencer_order" ADD CONSTRAINT "influencer_order_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "influencer_creator_id_idx" ON "influencer" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "influencer_order_creator_id_idx" ON "influencer_order" USING btree ("creator_id");