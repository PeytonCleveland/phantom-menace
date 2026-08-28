CREATE TYPE "evidence"."performance_scope" AS ENUM('focused', 'composite', 'integrated');--> statement-breakpoint
CREATE TYPE "evidence"."transfer_distance" AS ENUM('same', 'near', 'far');--> statement-breakpoint
ALTER TABLE "assessment"."task_objective_evidence_spec" ADD COLUMN "minimum_transfer_distance" "evidence"."transfer_distance" DEFAULT 'same' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment"."task_objective_evidence_spec" ADD COLUMN "minimum_performance_scope" "evidence"."performance_scope" DEFAULT 'focused' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment"."task_variant" ADD COLUMN "transfer_distance_default" "evidence"."transfer_distance" DEFAULT 'same' NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment"."task_variant" ADD COLUMN "performance_scope_default" "evidence"."performance_scope" DEFAULT 'focused' NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence"."observation" ADD COLUMN "transfer_distance" "evidence"."transfer_distance" NOT NULL;--> statement-breakpoint
ALTER TABLE "evidence"."observation" ADD COLUMN "performance_scope" "evidence"."performance_scope" DEFAULT 'focused' NOT NULL;--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement" ADD COLUMN "minimum_transfer_distance" "evidence"."transfer_distance";--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement" ADD COLUMN "minimum_performance_scope" "evidence"."performance_scope";--> statement-breakpoint
ALTER TABLE "assessment"."task_objective_evidence_spec" DROP COLUMN "minimum_transfer";--> statement-breakpoint
ALTER TABLE "assessment"."task_variant" DROP COLUMN "novelty_default";--> statement-breakpoint
ALTER TABLE "evidence"."observation" DROP COLUMN "transfer_level";--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement" DROP COLUMN "minimum_transfer";--> statement-breakpoint
DROP TYPE "evidence"."transfer_level";