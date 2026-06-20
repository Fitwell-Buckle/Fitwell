CREATE TABLE "trade_show_vendor_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"vendor_id" text NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_show_vendor_comment" ADD CONSTRAINT "trade_show_vendor_comment_vendor_id_trade_show_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."trade_show_vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_show_vendor_comment" ADD CONSTRAINT "trade_show_vendor_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_show_vendor_comment_vendor_id_idx" ON "trade_show_vendor_comment" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "trade_show_vendor_comment_created_at_idx" ON "trade_show_vendor_comment" USING btree ("created_at");