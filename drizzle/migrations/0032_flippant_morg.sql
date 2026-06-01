CREATE TABLE "lead_comment" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"author_user_id" text,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_comment" ADD CONSTRAINT "lead_comment_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_comment" ADD CONSTRAINT "lead_comment_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_comment_lead_id_idx" ON "lead_comment" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "lead_comment_created_at_idx" ON "lead_comment" USING btree ("created_at");