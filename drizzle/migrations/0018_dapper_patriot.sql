CREATE TABLE "production_stage_label" (
	"stage" "production_stage" PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
