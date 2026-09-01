ALTER TABLE "assessment"."evidence_spec_observable" DROP COLUMN "critical";--> statement-breakpoint
ALTER TABLE "assessment"."task_objective_evidence_spec" DROP COLUMN "direct_evidence_required";--> statement-breakpoint
ALTER TABLE "catalog"."learning_objective_revision" DROP COLUMN "success_criteria";--> statement-breakpoint
ALTER TABLE "catalog"."learning_objective_revision" DROP COLUMN "critical_errors";--> statement-breakpoint
ALTER TABLE "catalog"."objective_evidence_implication" DROP COLUMN "required_observable_codes";--> statement-breakpoint
ALTER TABLE "catalog"."objective_evidence_implication" DROP COLUMN "transitive";