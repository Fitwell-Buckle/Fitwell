CREATE TABLE "production_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text,
	"line_item_id" text,
	"blob_url" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_attachment_one_parent" CHECK (("production_attachment"."po_id" is null) <> ("production_attachment"."line_item_id" is null))
);
--> statement-breakpoint
CREATE TABLE "production_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"po_id" text,
	"line_item_id" text,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_comment_one_parent" CHECK (("production_comment"."po_id" is null) <> ("production_comment"."line_item_id" is null))
);
--> statement-breakpoint
ALTER TABLE "production_attachment" ADD CONSTRAINT "production_attachment_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachment" ADD CONSTRAINT "production_attachment_line_item_id_production_po_line_item_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."production_po_line_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachment" ADD CONSTRAINT "production_attachment_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comment" ADD CONSTRAINT "production_comment_po_id_production_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."production_po"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comment" ADD CONSTRAINT "production_comment_line_item_id_production_po_line_item_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."production_po_line_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comment" ADD CONSTRAINT "production_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_attachment_po_id_idx" ON "production_attachment" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "production_attachment_line_item_id_idx" ON "production_attachment" USING btree ("line_item_id");--> statement-breakpoint
CREATE INDEX "production_comment_po_id_idx" ON "production_comment" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "production_comment_line_item_id_idx" ON "production_comment" USING btree ("line_item_id");