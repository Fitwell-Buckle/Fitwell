CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"platform" text,
	"external_id" text,
	"status" text DEFAULT 'active',
	"start_date" timestamp,
	"end_date" timestamp,
	"budget" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" text PRIMARY KEY NOT NULL,
	"shopify_id" text,
	"email" text,
	"first_name" text,
	"last_name" text,
	"phone" text,
	"total_spent" integer DEFAULT 0,
	"order_count" integer DEFAULT 0,
	"first_order_at" timestamp,
	"last_order_at" timestamp,
	"tags" text[],
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "customer_shopify_id_unique" UNIQUE("shopify_id")
);
--> statement-breakpoint
CREATE TABLE "customer_event" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"event_type" text NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ga4_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"sessions" integer DEFAULT 0,
	"users" integer DEFAULT 0,
	"new_users" integer DEFAULT 0,
	"pageviews" integer DEFAULT 0,
	"bounce_rate" real,
	"avg_session_duration" real,
	"source" text,
	"medium" text
);
--> statement-breakpoint
CREATE TABLE "google_ads_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"campaign_name" text,
	"campaign_id" text,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"cost" integer DEFAULT 0,
	"conversions" real,
	"conversion_value" real
);
--> statement-breakpoint
CREATE TABLE "gsc_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"query" text,
	"page" text,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"ctr" real,
	"position" real
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY NOT NULL,
	"shopify_id" text,
	"shopify_order_number" integer,
	"customer_id" text,
	"total_price" integer DEFAULT 0,
	"subtotal_price" integer DEFAULT 0,
	"currency" text DEFAULT 'USD',
	"financial_status" text,
	"fulfillment_status" text,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "order_shopify_id_unique" UNIQUE("shopify_id")
);
--> statement-breakpoint
CREATE TABLE "order_line_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"shopify_product_id" text,
	"shopify_variant_id" text,
	"title" text,
	"variant_title" text,
	"sku" text,
	"quantity" integer DEFAULT 1,
	"price" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "posthog_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"event_name" text,
	"count" integer DEFAULT 0,
	"unique_users" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"role" text DEFAULT 'user',
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "utm_attribution" (
	"id" text PRIMARY KEY NOT NULL,
	"visitor_id" text,
	"source" text,
	"medium" text,
	"campaign" text,
	"term" text,
	"content" text,
	"landing_page" text,
	"referrer" text,
	"captured_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_event" ADD CONSTRAINT "customer_event_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_item" ADD CONSTRAINT "order_line_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_shopify_id_idx" ON "customer" USING btree ("shopify_id");--> statement-breakpoint
CREATE INDEX "customer_email_idx" ON "customer" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customer_event_customer_id_idx" ON "customer_event" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_event_occurred_at_idx" ON "customer_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "ga4_daily_date_idx" ON "ga4_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "google_ads_daily_date_idx" ON "google_ads_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "gsc_daily_date_idx" ON "gsc_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "order_shopify_id_idx" ON "order" USING btree ("shopify_id");--> statement-breakpoint
CREATE INDEX "order_customer_id_idx" ON "order" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "order_processed_at_idx" ON "order" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "line_item_order_id_idx" ON "order_line_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "posthog_daily_date_idx" ON "posthog_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "utm_visitor_id_idx" ON "utm_attribution" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "utm_captured_at_idx" ON "utm_attribution" USING btree ("captured_at");