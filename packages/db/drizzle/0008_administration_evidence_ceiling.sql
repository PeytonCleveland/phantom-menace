ALTER TABLE "assessment"."task_revision" DROP CONSTRAINT "ck_task_evidence_ceiling";--> statement-breakpoint
ALTER TABLE "assessment"."task_administration" ADD COLUMN "effective_evidence_ceiling" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment"."task_revision" ADD COLUMN "design_evidence_ceiling" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "assessment"."task_revision" DROP COLUMN "evidence_ceiling";--> statement-breakpoint
ALTER TABLE "assessment"."task_administration" ADD CONSTRAINT "ck_administration_effective_ceiling" CHECK (effective_evidence_ceiling BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "assessment"."task_revision" ADD CONSTRAINT "ck_task_design_evidence_ceiling" CHECK (design_evidence_ceiling BETWEEN 1 AND 5);