CREATE TABLE "klaviyo_email_performance" (
	"campaign_id" text PRIMARY KEY NOT NULL,
	"campaign_name" text,
	"sent_at" timestamp,
	"sends" integer DEFAULT 0,
	"opens" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"conversions" integer DEFAULT 0,
	"revenue_cents" integer DEFAULT 0,
	"captured_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "klaviyo_flow_attribution" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"flow_name" text,
	"customer_id" text,
	"order_id" text,
	"attributed_revenue_cents" integer DEFAULT 0,
	"attributed_order_count" integer DEFAULT 0,
	"touched_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "klaviyo_list_growth_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp NOT NULL,
	"list_id" text NOT NULL,
	"list_name" text,
	"subscribers" integer,
	"new_subscribers" integer DEFAULT 0,
	"unsubscribes" integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE "klaviyo_flow_attribution" ADD CONSTRAINT "klaviyo_flow_attribution_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "klaviyo_flow_attribution" ADD CONSTRAINT "klaviyo_flow_attribution_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "klaviyo_email_performance_sent_at_idx" ON "klaviyo_email_performance" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "klaviyo_flow_attribution_flow_id_idx" ON "klaviyo_flow_attribution" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "klaviyo_flow_attribution_touched_at_idx" ON "klaviyo_flow_attribution" USING btree ("touched_at");--> statement-breakpoint
CREATE INDEX "klaviyo_list_growth_daily_date_idx" ON "klaviyo_list_growth_daily" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "klaviyo_list_growth_daily_date_list_uniq" ON "klaviyo_list_growth_daily" USING btree ("date","list_id");