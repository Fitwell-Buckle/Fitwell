CREATE TABLE "sent_email" (
	"id" text PRIMARY KEY NOT NULL,
	"gmail_message_id" text NOT NULL,
	"thread_id" text,
	"message_id_header" text,
	"mailbox_user_id" text,
	"from_email" text,
	"to_email" text NOT NULL,
	"subject" text,
	"sent_at" timestamp,
	"lead_id" text,
	"customer_id" text,
	"supplier_id" text,
	"replied_at" timestamp,
	"followup_queued_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sent_email_gmail_message_id_unique" UNIQUE("gmail_message_id")
);
--> statement-breakpoint
ALTER TABLE "outbound_message" ALTER COLUMN "lead_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD COLUMN "supplier_id" text;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD COLUMN "in_reply_to" text;--> statement-breakpoint
ALTER TABLE "sent_email" ADD CONSTRAINT "sent_email_mailbox_user_id_user_id_fk" FOREIGN KEY ("mailbox_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_email" ADD CONSTRAINT "sent_email_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_email" ADD CONSTRAINT "sent_email_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_email" ADD CONSTRAINT "sent_email_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sent_email_gmail_message_id_idx" ON "sent_email" USING btree ("gmail_message_id");--> statement-breakpoint
CREATE INDEX "sent_email_sent_at_idx" ON "sent_email" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "sent_email_lead_id_idx" ON "sent_email" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "sent_email_customer_id_idx" ON "sent_email" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sent_email_supplier_id_idx" ON "sent_email" USING btree ("supplier_id");--> statement-breakpoint
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_message" ADD CONSTRAINT "outbound_message_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outbound_message_customer_id_idx" ON "outbound_message" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "outbound_message_supplier_id_idx" ON "outbound_message" USING btree ("supplier_id");