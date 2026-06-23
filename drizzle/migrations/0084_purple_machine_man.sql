CREATE TABLE "cad_model" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"fusion_url" text,
	"source_stl_url" text,
	"source_filename" text,
	"glb_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"error_message" text,
	"vertex_count" integer,
	"triangle_count" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_cad_model" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"cad_model_id" text,
	"published_to_website_at" timestamp,
	"shopify_product_id" text,
	"shopify_media_id" text,
	"shopify_published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prototype" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"proposed_sku" text,
	"final_sku" text,
	"supplier_id" text,
	"status" text DEFAULT 'concept' NOT NULL,
	"description" text,
	"est_unit_cost_cents" integer,
	"approved_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prototype_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"prototype_id" text,
	"round_id" text,
	"blob_url" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prototype_attachment_one_parent" CHECK (("prototype_attachment"."prototype_id" is null) <> ("prototype_attachment"."round_id" is null))
);
--> statement-breakpoint
CREATE TABLE "prototype_reference" (
	"id" text PRIMARY KEY NOT NULL,
	"prototype_id" text NOT NULL,
	"url" text NOT NULL,
	"embed_url" text,
	"title" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prototype_round" (
	"id" text PRIMARY KEY NOT NULL,
	"prototype_id" text NOT NULL,
	"round_number" integer NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"requested_at" date,
	"expected_at" date,
	"received_at" date,
	"sample_qty" integer,
	"unit_cost_cents" integer,
	"feedback" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "product_cad_model" ADD CONSTRAINT "product_cad_model_cad_model_id_cad_model_id_fk" FOREIGN KEY ("cad_model_id") REFERENCES "public"."cad_model"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype" ADD CONSTRAINT "prototype_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_attachment" ADD CONSTRAINT "prototype_attachment_prototype_id_prototype_id_fk" FOREIGN KEY ("prototype_id") REFERENCES "public"."prototype"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_attachment" ADD CONSTRAINT "prototype_attachment_round_id_prototype_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."prototype_round"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_attachment" ADD CONSTRAINT "prototype_attachment_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_reference" ADD CONSTRAINT "prototype_reference_prototype_id_prototype_id_fk" FOREIGN KEY ("prototype_id") REFERENCES "public"."prototype"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prototype_round" ADD CONSTRAINT "prototype_round_prototype_id_prototype_id_fk" FOREIGN KEY ("prototype_id") REFERENCES "public"."prototype"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_cad_model_sku_idx" ON "product_cad_model" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "prototype_supplier_id_idx" ON "prototype" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "prototype_attachment_prototype_id_idx" ON "prototype_attachment" USING btree ("prototype_id");--> statement-breakpoint
CREATE INDEX "prototype_attachment_round_id_idx" ON "prototype_attachment" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "prototype_reference_prototype_id_idx" ON "prototype_reference" USING btree ("prototype_id");--> statement-breakpoint
CREATE INDEX "prototype_round_prototype_id_idx" ON "prototype_round" USING btree ("prototype_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prototype_round_number_idx" ON "prototype_round" USING btree ("prototype_id","round_number");