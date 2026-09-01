CREATE TYPE "catalog"."criterion_kind" AS ENUM('success', 'quality', 'verification', 'process', 'critical_error');--> statement-breakpoint
CREATE TABLE "assessment"."observable_criterion_mapping" (
	"evidence_spec_observable_id" uuid NOT NULL,
	"objective_criterion_id" uuid NOT NULL,
	CONSTRAINT "observable_criterion_mapping_evidence_spec_observable_id_objective_criterion_id_pk" PRIMARY KEY("evidence_spec_observable_id","objective_criterion_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."objective_criterion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	"code" text NOT NULL,
	"statement" text NOT NULL,
	"kind" "catalog"."criterion_kind" NOT NULL,
	"sort_order" integer,
	CONSTRAINT "uq_objective_criterion_code" UNIQUE("objective_revision_id","code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."objective_evidence_implication_criterion" (
	"implication_id" uuid NOT NULL,
	"objective_criterion_id" uuid NOT NULL,
	CONSTRAINT "pk_evidence_implication_criterion" PRIMARY KEY("implication_id","objective_criterion_id")
);
--> statement-breakpoint
ALTER TABLE "assessment"."observable_criterion_mapping" ADD CONSTRAINT "observable_criterion_mapping_evidence_spec_observable_id_evidence_spec_observable_id_fk" FOREIGN KEY ("evidence_spec_observable_id") REFERENCES "assessment"."evidence_spec_observable"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."observable_criterion_mapping" ADD CONSTRAINT "observable_criterion_mapping_objective_criterion_id_objective_criterion_id_fk" FOREIGN KEY ("objective_criterion_id") REFERENCES "catalog"."objective_criterion"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_criterion" ADD CONSTRAINT "objective_criterion_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_evidence_implication_criterion" ADD CONSTRAINT "fk_evidence_implication_criterion_implication" FOREIGN KEY ("implication_id") REFERENCES "catalog"."objective_evidence_implication"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_evidence_implication_criterion" ADD CONSTRAINT "fk_evidence_implication_criterion_criterion" FOREIGN KEY ("objective_criterion_id") REFERENCES "catalog"."objective_criterion"("id") ON DELETE no action ON UPDATE no action;