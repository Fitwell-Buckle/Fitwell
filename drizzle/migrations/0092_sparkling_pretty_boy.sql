CREATE TABLE "product_idea" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'idea' NOT NULL,
	"impact" integer,
	"confidence" integer,
	"ease" integer,
	"notes" text,
	"promoted_prototype_id" text,
	"promoted_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "product_idea" ADD CONSTRAINT "product_idea_promoted_prototype_id_prototype_id_fk" FOREIGN KEY ("promoted_prototype_id") REFERENCES "public"."prototype"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_idea_status_idx" ON "product_idea" USING btree ("status");