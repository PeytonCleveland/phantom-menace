CREATE TYPE "catalog"."context_policy" AS ENUM('required', 'optional', 'not_applicable');--> statement-breakpoint
CREATE TABLE "learner"."objective_assertion_context" (
	"assertion_id" uuid NOT NULL,
	"dimension_code" text NOT NULL,
	"context_value_id" uuid NOT NULL,
	CONSTRAINT "objective_assertion_context_assertion_id_dimension_code_pk" PRIMARY KEY("assertion_id","dimension_code")
);
--> statement-breakpoint
CREATE TABLE "assessment"."task_variant_context" (
	"task_variant_id" uuid NOT NULL,
	"dimension_code" text NOT NULL,
	"context_value_id" uuid NOT NULL,
	CONSTRAINT "task_variant_context_task_variant_id_dimension_code_pk" PRIMARY KEY("task_variant_id","dimension_code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."objective_context_allowed_value" (
	"objective_revision_id" uuid NOT NULL,
	"dimension_code" text NOT NULL,
	"context_value_id" uuid NOT NULL,
	CONSTRAINT "objective_context_allowed_value_objective_revision_id_dimension_code_context_value_id_pk" PRIMARY KEY("objective_revision_id","dimension_code","context_value_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."objective_context_policy" (
	"objective_revision_id" uuid NOT NULL,
	"dimension_code" text NOT NULL,
	"policy" "catalog"."context_policy" NOT NULL,
	CONSTRAINT "objective_context_policy_objective_revision_id_dimension_code_pk" PRIMARY KEY("objective_revision_id","dimension_code")
);
--> statement-breakpoint
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
CREATE TABLE "evidence"."observation_context" (
	"observation_id" uuid NOT NULL,
	"dimension_code" text NOT NULL,
	"context_value_id" uuid NOT NULL,
	CONSTRAINT "observation_context_observation_id_dimension_code_pk" PRIMARY KEY("observation_id","dimension_code")
);
--> statement-breakpoint
CREATE TABLE "qualification"."objective_requirement_context" (
	"objective_requirement_id" uuid NOT NULL,
	"dimension_code" text NOT NULL,
	"context_value_id" uuid,
	"minimum_distinct_values" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "objective_requirement_context_objective_requirement_id_dimension_code_pk" PRIMARY KEY("objective_requirement_id","dimension_code"),
	CONSTRAINT "ck_requirement_context_pin_or_breadth" CHECK (context_value_id IS NULL OR minimum_distinct_values = 1),
	CONSTRAINT "ck_requirement_context_minimum" CHECK (minimum_distinct_values >= 1)
);
--> statement-breakpoint
ALTER TABLE "learner"."assertion_evidence" DROP CONSTRAINT "fk_assertion_evidence_assertion";
--> statement-breakpoint
ALTER TABLE "learner"."assertion_evidence" DROP CONSTRAINT "assertion_evidence_learner_id_objective_revision_id_evidence_observation_id_pk";--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion" DROP CONSTRAINT "objective_assertion_learner_id_objective_revision_id_pk";--> statement-breakpoint
ALTER TABLE "learner"."assertion_evidence" ADD COLUMN "assertion_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "learner"."assertion_evidence" ADD CONSTRAINT "assertion_evidence_assertion_id_evidence_observation_id_pk" PRIMARY KEY("assertion_id","evidence_observation_id");--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion" ADD COLUMN "context_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion_context" ADD CONSTRAINT "objective_assertion_context_assertion_id_objective_assertion_id_fk" FOREIGN KEY ("assertion_id") REFERENCES "learner"."objective_assertion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion_context" ADD CONSTRAINT "objective_assertion_context_dimension_code_context_dimension_code_fk" FOREIGN KEY ("dimension_code") REFERENCES "catalog"."context_dimension"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion_context" ADD CONSTRAINT "objective_assertion_context_context_value_id_context_value_id_fk" FOREIGN KEY ("context_value_id") REFERENCES "catalog"."context_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_variant_context" ADD CONSTRAINT "task_variant_context_task_variant_id_task_variant_id_fk" FOREIGN KEY ("task_variant_id") REFERENCES "assessment"."task_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_variant_context" ADD CONSTRAINT "task_variant_context_dimension_code_context_dimension_code_fk" FOREIGN KEY ("dimension_code") REFERENCES "catalog"."context_dimension"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_variant_context" ADD CONSTRAINT "task_variant_context_context_value_id_context_value_id_fk" FOREIGN KEY ("context_value_id") REFERENCES "catalog"."context_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_context_allowed_value" ADD CONSTRAINT "objective_context_allowed_value_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_context_allowed_value" ADD CONSTRAINT "objective_context_allowed_value_context_value_id_context_value_id_fk" FOREIGN KEY ("context_value_id") REFERENCES "catalog"."context_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_context_allowed_value" ADD CONSTRAINT "fk_objective_context_allowed_policy" FOREIGN KEY ("objective_revision_id","dimension_code") REFERENCES "catalog"."objective_context_policy"("objective_revision_id","dimension_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_context_policy" ADD CONSTRAINT "objective_context_policy_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_context_policy" ADD CONSTRAINT "objective_context_policy_dimension_code_context_dimension_code_fk" FOREIGN KEY ("dimension_code") REFERENCES "catalog"."context_dimension"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."context_value" ADD CONSTRAINT "context_value_dimension_code_context_dimension_code_fk" FOREIGN KEY ("dimension_code") REFERENCES "catalog"."context_dimension"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."context_value" ADD CONSTRAINT "context_value_parent_value_id_context_value_id_fk" FOREIGN KEY ("parent_value_id") REFERENCES "catalog"."context_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation_context" ADD CONSTRAINT "observation_context_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "evidence"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation_context" ADD CONSTRAINT "observation_context_dimension_code_context_dimension_code_fk" FOREIGN KEY ("dimension_code") REFERENCES "catalog"."context_dimension"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation_context" ADD CONSTRAINT "observation_context_context_value_id_context_value_id_fk" FOREIGN KEY ("context_value_id") REFERENCES "catalog"."context_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement_context" ADD CONSTRAINT "objective_requirement_context_objective_requirement_id_objective_requirement_id_fk" FOREIGN KEY ("objective_requirement_id") REFERENCES "qualification"."objective_requirement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement_context" ADD CONSTRAINT "objective_requirement_context_dimension_code_context_dimension_code_fk" FOREIGN KEY ("dimension_code") REFERENCES "catalog"."context_dimension"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement_context" ADD CONSTRAINT "objective_requirement_context_context_value_id_context_value_id_fk" FOREIGN KEY ("context_value_id") REFERENCES "catalog"."context_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner"."assertion_evidence" ADD CONSTRAINT "assertion_evidence_assertion_id_objective_assertion_id_fk" FOREIGN KEY ("assertion_id") REFERENCES "learner"."objective_assertion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner"."assertion_evidence" DROP COLUMN "learner_id";--> statement-breakpoint
ALTER TABLE "learner"."assertion_evidence" DROP COLUMN "objective_revision_id";--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion" ADD CONSTRAINT "uq_objective_assertion_scope" UNIQUE("learner_id","objective_revision_id","context_key");