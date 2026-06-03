CREATE TABLE "review" (
	"id" text PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"source" text DEFAULT 'judgeme' NOT NULL,
	"reviewer_email" text,
	"reviewer_name" text,
	"rating" integer,
	"title" text,
	"body" text,
	"verified" boolean DEFAULT false,
	"product_id" text,
	"product_handle" text,
	"location" text,
	"review_date" timestamp,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "review_source_external_id_uniq" ON "review" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "review_reviewer_email_idx" ON "review" USING btree ("reviewer_email");--> statement-breakpoint
CREATE INDEX "review_rating_idx" ON "review" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "review_review_date_idx" ON "review" USING btree ("review_date");