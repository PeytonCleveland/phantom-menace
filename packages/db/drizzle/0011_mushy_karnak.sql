ALTER TABLE "learner"."objective_assertion_context" DROP CONSTRAINT "objective_assertion_context_context_value_id_context_value_id_fk";
--> statement-breakpoint
ALTER TABLE "assessment"."task_variant_context" DROP CONSTRAINT "task_variant_context_context_value_id_context_value_id_fk";
--> statement-breakpoint
ALTER TABLE "evidence"."observation_context" DROP CONSTRAINT "observation_context_context_value_id_context_value_id_fk";
--> statement-breakpoint
ALTER TABLE "catalog"."context_value" ADD CONSTRAINT "uq_context_value_id_dimension" UNIQUE("id","dimension_code");
--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion_context" ADD CONSTRAINT "fk_objective_assertion_context_value_dimension" FOREIGN KEY ("context_value_id","dimension_code") REFERENCES "catalog"."context_value"("id","dimension_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_variant_context" ADD CONSTRAINT "fk_task_variant_context_value_dimension" FOREIGN KEY ("context_value_id","dimension_code") REFERENCES "catalog"."context_value"("id","dimension_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation_context" ADD CONSTRAINT "fk_observation_context_value_dimension" FOREIGN KEY ("context_value_id","dimension_code") REFERENCES "catalog"."context_value"("id","dimension_code") ON DELETE no action ON UPDATE no action;
