CREATE TABLE "assistant_conversation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"model" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assistant_message" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"steps_json" jsonb,
	"stopped_at_step_limit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assistant_query" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source" text DEFAULT 'postgres' NOT NULL,
	"query_text" text NOT NULL,
	"category" text,
	"tables_touched" text[],
	"row_count" integer,
	"duration_ms" integer,
	"error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "assistant_conversation" ADD CONSTRAINT "assistant_conversation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_message" ADD CONSTRAINT "assistant_message_conversation_id_assistant_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_query" ADD CONSTRAINT "assistant_query_message_id_assistant_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."assistant_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_query" ADD CONSTRAINT "assistant_query_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_conversation_user_id_idx" ON "assistant_conversation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assistant_message_conversation_id_idx" ON "assistant_message" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "assistant_query_message_id_idx" ON "assistant_query" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "assistant_query_user_id_idx" ON "assistant_query" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assistant_query_category_idx" ON "assistant_query" USING btree ("category");