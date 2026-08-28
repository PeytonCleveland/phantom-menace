ALTER TABLE "catalog"."learning_objective_revision" DROP CONSTRAINT "ck_objective_assurance_class";--> statement-breakpoint
ALTER TABLE "catalog"."learning_objective_revision" RENAME COLUMN "assurance_class" TO "default_assurance_class";--> statement-breakpoint
ALTER TABLE "catalog"."learning_objective_revision" ADD CONSTRAINT "ck_objective_default_assurance_class" CHECK (default_assurance_class IN ('A', 'B', 'C'));--> statement-breakpoint
CREATE TABLE "catalog"."objective_claim_evidence_constraint" (
	"objective_revision_id" uuid PRIMARY KEY NOT NULL,
	"practical_performance_required" boolean NOT NULL,
	"constructed_response_supported" boolean NOT NULL,
	"multiple_choice_alone_sufficient" boolean NOT NULL,
	"direct_observation_possible" boolean NOT NULL,
	CONSTRAINT "ck_claim_constraint_coherent" CHECK (NOT (practical_performance_required AND multiple_choice_alone_sufficient))
);
--> statement-breakpoint
ALTER TABLE "catalog"."objective_claim_evidence_constraint" ADD CONSTRAINT "fk_claim_constraint_objective_revision" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement" ADD COLUMN "required_assurance_class" char(1) NOT NULL;--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement" ADD CONSTRAINT "ck_objective_requirement_assurance" CHECK (required_assurance_class IN ('A','B','C'));
