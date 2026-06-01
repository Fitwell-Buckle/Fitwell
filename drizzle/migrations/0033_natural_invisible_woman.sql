CREATE TABLE "customer_message" (
	"id" text PRIMARY KEY NOT NULL,
	"gmail_message_id" text NOT NULL,
	"thread_id" text,
	"mailbox_user_id" text,
	"mailbox_label" text,
	"from_email" text NOT NULL,
	"from_name" text,
	"subject" text,
	"snippet" text,
	"received_at" timestamp,
	"audience" text NOT NULL,
	"customer_id" text,
	"company_id" text,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_message_gmail_message_id_unique" UNIQUE("gmail_message_id")
);
--> statement-breakpoint
ALTER TABLE "admin_notification" ADD COLUMN "href" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "dismissed_reply_ids" text[];--> statement-breakpoint
ALTER TABLE "customer_message" ADD CONSTRAINT "customer_message_mailbox_user_id_user_id_fk" FOREIGN KEY ("mailbox_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_message" ADD CONSTRAINT "customer_message_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_message" ADD CONSTRAINT "customer_message_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_message_audience_idx" ON "customer_message" USING btree ("audience");--> statement-breakpoint
CREATE INDEX "customer_message_dismissed_at_idx" ON "customer_message" USING btree ("dismissed_at");--> statement-breakpoint
CREATE INDEX "customer_message_received_at_idx" ON "customer_message" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "customer_message_customer_id_idx" ON "customer_message" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_message_company_id_idx" ON "customer_message" USING btree ("company_id");