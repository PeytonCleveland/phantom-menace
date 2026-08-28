CREATE TYPE "catalog"."context_policy" AS ENUM('required', 'optional', 'not_applicable');--> statement-breakpoint
CREATE TABLE "catalog"."context_dimension" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_context_dimension_code_format" CHECK (code !~ E'[\x3B=]')
);
--> statement-breakpoint
CREATE TABLE "catalog"."context_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dimension_code" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"parent_value_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_context_value_code" UNIQUE("dimension_code","code"),
	CONSTRAINT "ck_context_value_no_self_parent" CHECK (parent_value_id IS NULL OR parent_value_id <> id),
	CONSTRAINT "ck_context_value_code_format" CHECK (code !~ E'[\x3B=]')
);
--> statement-breakpoint
ALTER TABLE "catalog"."context_value" ADD CONSTRAINT "context_value_dimension_code_context_dimension_code_fk" FOREIGN KEY ("dimension_code") REFERENCES "catalog"."context_dimension"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."context_value" ADD CONSTRAINT "context_value_parent_value_id_context_value_id_fk" FOREIGN KEY ("parent_value_id") REFERENCES "catalog"."context_value"("id") ON DELETE no action ON UPDATE no action;