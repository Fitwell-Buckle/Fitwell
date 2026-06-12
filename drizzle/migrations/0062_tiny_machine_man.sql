CREATE TABLE "company_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_attachment" ADD CONSTRAINT "company_attachment_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_attachment" ADD CONSTRAINT "company_attachment_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_attachment_company_id_idx" ON "company_attachment" USING btree ("company_id");