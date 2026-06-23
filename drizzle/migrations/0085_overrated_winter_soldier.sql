ALTER TABLE "cad_model" ADD COLUMN "export_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "cad_model" ADD COLUMN "export_requested_by_user_id" text;--> statement-breakpoint
ALTER TABLE "cad_model" ADD COLUMN "expected_filename" text;--> statement-breakpoint
ALTER TABLE "cad_model" ADD CONSTRAINT "cad_model_export_requested_by_user_id_user_id_fk" FOREIGN KEY ("export_requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;