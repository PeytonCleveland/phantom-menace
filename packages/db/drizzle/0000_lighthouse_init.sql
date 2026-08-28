CREATE SCHEMA "assessment";
--> statement-breakpoint
CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE SCHEMA "catalog";
--> statement-breakpoint
CREATE SCHEMA "evidence";
--> statement-breakpoint
CREATE SCHEMA "learner";
--> statement-breakpoint
CREATE SCHEMA "learning";
--> statement-breakpoint
CREATE SCHEMA "projection";
--> statement-breakpoint
CREATE SCHEMA "qualification";
--> statement-breakpoint
CREATE TYPE "assessment"."administration_mode" AS ENUM('practice', 'formative', 'summative', 'qualification');--> statement-breakpoint
CREATE TYPE "learner"."assertion_state" AS ENUM('unassessed', 'developing', 'demonstrated', 'stale', 'contradicted');--> statement-breakpoint
CREATE TYPE "assessment"."claim_role" AS ENUM('primary', 'supporting', 'incidental');--> statement-breakpoint
CREATE TYPE "catalog"."competency_relationship_type" AS ENUM('foundation_for', 'prerequisite_for', 'applied_in', 'overlaps_with', 'specializes', 'integrates_with');--> statement-breakpoint
CREATE TYPE "catalog"."evidence_implication_type" AS ENUM('evidence_supports', 'fully_subsumes');--> statement-breakpoint
CREATE TYPE "evidence"."evidence_origin" AS ENUM('direct', 'proxy');--> statement-breakpoint
CREATE TYPE "evidence"."evidence_strength" AS ENUM('direct', 'supporting', 'incidental');--> statement-breakpoint
CREATE TYPE "catalog"."membership_role" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TYPE "catalog"."objective_relationship_type" AS ENUM('performance_requires', 'learning_precedes', 'supports', 'specializes', 'generalizes', 'related_to', 'co_assessed_with', 'often_confused_with');--> statement-breakpoint
CREATE TYPE "evidence"."observation_result" AS ENUM('successful', 'partial', 'unsuccessful');--> statement-breakpoint
CREATE TYPE "catalog"."publication_status" AS ENUM('draft', 'published', 'retired');--> statement-breakpoint
CREATE TYPE "catalog"."relationship_provenance" AS ENUM('sme', 'derived', 'hybrid', 'ai_suggested', 'empirical');--> statement-breakpoint
CREATE TYPE "catalog"."relationship_strength" AS ENUM('hard', 'strong', 'soft', 'empirical');--> statement-breakpoint
CREATE TYPE "qualification"."requirement_operator" AS ENUM('all_of', 'any_of', 'n_of');--> statement-breakpoint
CREATE TYPE "assessment"."task_kind" AS ENUM('exercise', 'lab', 'challenge', 'mission', 'workplace_portfolio');--> statement-breakpoint
CREATE TYPE "evidence"."transfer_level" AS ENUM('same', 'near', 'far', 'integrated');--> statement-breakpoint
CREATE TYPE "catalog"."validation_status" AS ENUM('pending', 'approved', 'rejected', 'deprecated');--> statement-breakpoint
CREATE TABLE "catalog"."capability_set" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capability_set_canonical_code_unique" UNIQUE("canonical_code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."capability_set_competency_member" (
	"capability_set_revision_id" uuid NOT NULL,
	"competency_revision_id" uuid NOT NULL,
	"selection_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "capability_set_competency_member_capability_set_revision_id_competency_revision_id_pk" PRIMARY KEY("capability_set_revision_id","competency_revision_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."capability_set_domain_member" (
	"capability_set_revision_id" uuid NOT NULL,
	"domain_revision_id" uuid NOT NULL,
	"selection_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "capability_set_domain_member_capability_set_revision_id_domain_revision_id_pk" PRIMARY KEY("capability_set_revision_id","domain_revision_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."capability_set_nested_member" (
	"parent_capability_set_revision_id" uuid NOT NULL,
	"child_capability_set_revision_id" uuid NOT NULL,
	CONSTRAINT "pk_capability_set_nested_member" PRIMARY KEY("parent_capability_set_revision_id","child_capability_set_revision_id"),
	CONSTRAINT "ck_capability_set_nested_no_self" CHECK (parent_capability_set_revision_id <> child_capability_set_revision_id)
);
--> statement-breakpoint
CREATE TABLE "catalog"."capability_set_objective_member" (
	"capability_set_revision_id" uuid NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	CONSTRAINT "capability_set_objective_member_capability_set_revision_id_objective_revision_id_pk" PRIMARY KEY("capability_set_revision_id","objective_revision_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."capability_set_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capability_set_id" uuid NOT NULL,
	"framework_release_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "catalog"."publication_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "uq_capability_set_revision_no" UNIQUE("capability_set_id","revision_no"),
	CONSTRAINT "ck_capability_set_revision_no_positive" CHECK (revision_no > 0)
);
--> statement-breakpoint
CREATE TABLE "catalog"."competency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competency_canonical_code_unique" UNIQUE("canonical_code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."competency_objective_membership" (
	"framework_release_id" uuid NOT NULL,
	"competency_revision_id" uuid NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	"membership_role" "catalog"."membership_role" NOT NULL,
	"sort_order" integer,
	CONSTRAINT "competency_objective_membership_framework_release_id_competency_revision_id_objective_revision_id_pk" PRIMARY KEY("framework_release_id","competency_revision_id","objective_revision_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."competency_relationship" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_release_id" uuid NOT NULL,
	"source_competency_revision_id" uuid NOT NULL,
	"target_competency_revision_id" uuid NOT NULL,
	"relationship_type" "catalog"."competency_relationship_type" NOT NULL,
	"rationale" text NOT NULL,
	"provenance" "catalog"."relationship_provenance" NOT NULL,
	"confidence" numeric(4, 3),
	"supporting_objective_edge_count" integer DEFAULT 0 NOT NULL,
	"validation_status" "catalog"."validation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_competency_relationship" UNIQUE("framework_release_id","source_competency_revision_id","target_competency_revision_id","relationship_type"),
	CONSTRAINT "ck_competency_relationship_no_self" CHECK (source_competency_revision_id <> target_competency_revision_id),
	CONSTRAINT "ck_competency_relationship_confidence" CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
	CONSTRAINT "ck_competency_relationship_edge_count" CHECK (supporting_objective_edge_count >= 0)
);
--> statement-breakpoint
CREATE TABLE "catalog"."competency_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competency_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"outcome_statement" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_competency_revision_no" UNIQUE("competency_id","revision_no"),
	CONSTRAINT "ck_competency_revision_no_positive" CHECK (revision_no > 0)
);
--> statement-breakpoint
CREATE TABLE "catalog"."domain" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_canonical_code_unique" UNIQUE("canonical_code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."domain_competency_membership" (
	"framework_release_id" uuid NOT NULL,
	"domain_revision_id" uuid NOT NULL,
	"competency_revision_id" uuid NOT NULL,
	"membership_role" "catalog"."membership_role" NOT NULL,
	"sort_order" integer,
	CONSTRAINT "domain_competency_membership_framework_release_id_domain_revision_id_competency_revision_id_pk" PRIMARY KEY("framework_release_id","domain_revision_id","competency_revision_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."domain_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_domain_revision_no" UNIQUE("domain_id","revision_no"),
	CONSTRAINT "ck_domain_revision_no_positive" CHECK (revision_no > 0)
);
--> statement-breakpoint
CREATE TABLE "catalog"."framework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "framework_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."framework_release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_id" uuid NOT NULL,
	"version" text NOT NULL,
	"status" "catalog"."publication_status" DEFAULT 'draft' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "uq_framework_release_version" UNIQUE("framework_id","version"),
	CONSTRAINT "ck_framework_release_published_at" CHECK ((status = 'published' AND published_at IS NOT NULL) OR status <> 'published')
);
--> statement-breakpoint
CREATE TABLE "catalog"."framework_release_competency" (
	"framework_release_id" uuid NOT NULL,
	"competency_revision_id" uuid NOT NULL,
	CONSTRAINT "framework_release_competency_framework_release_id_competency_revision_id_pk" PRIMARY KEY("framework_release_id","competency_revision_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."framework_release_domain" (
	"framework_release_id" uuid NOT NULL,
	"domain_revision_id" uuid NOT NULL,
	"sort_order" integer,
	CONSTRAINT "framework_release_domain_framework_release_id_domain_revision_id_pk" PRIMARY KEY("framework_release_id","domain_revision_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."framework_release_objective" (
	"framework_release_id" uuid NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	CONSTRAINT "framework_release_objective_framework_release_id_objective_revision_id_pk" PRIMARY KEY("framework_release_id","objective_revision_id")
);
--> statement-breakpoint
CREATE TABLE "catalog"."learning_objective" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_objective_canonical_code_unique" UNIQUE("canonical_code")
);
--> statement-breakpoint
CREATE TABLE "catalog"."learning_objective_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learning_objective_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"title" text NOT NULL,
	"statement" text NOT NULL,
	"mastery_level" smallint NOT NULL,
	"verb_code" text NOT NULL,
	"assurance_class" char(1) NOT NULL,
	"performance_object" text DEFAULT '' NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"success_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"critical_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"performance_modes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_objective_revision_no" UNIQUE("learning_objective_id","revision_no"),
	CONSTRAINT "ck_objective_revision_no_positive" CHECK (revision_no > 0),
	CONSTRAINT "ck_objective_mastery_level" CHECK (mastery_level BETWEEN 1 AND 5),
	CONSTRAINT "ck_objective_assurance_class" CHECK (assurance_class IN ('A', 'B', 'C'))
);
--> statement-breakpoint
CREATE TABLE "catalog"."objective_evidence_implication" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_release_id" uuid NOT NULL,
	"source_objective_revision_id" uuid NOT NULL,
	"target_objective_revision_id" uuid NOT NULL,
	"implication_type" "catalog"."evidence_implication_type" NOT NULL,
	"derived_evidence_strength" "evidence"."evidence_strength" NOT NULL,
	"maximum_target_state" "learner"."assertion_state" NOT NULL,
	"required_observable_codes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"transitive" boolean DEFAULT false NOT NULL,
	"rationale" text NOT NULL,
	"validation_status" "catalog"."validation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_objective_evidence_implication" UNIQUE("framework_release_id","source_objective_revision_id","target_objective_revision_id","implication_type"),
	CONSTRAINT "ck_evidence_implication_no_self" CHECK (source_objective_revision_id <> target_objective_revision_id),
	CONSTRAINT "ck_evidence_implication_max_state" CHECK (maximum_target_state IN ('developing', 'demonstrated'))
);
--> statement-breakpoint
CREATE TABLE "catalog"."objective_relationship" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_release_id" uuid NOT NULL,
	"source_objective_revision_id" uuid NOT NULL,
	"target_objective_revision_id" uuid NOT NULL,
	"relationship_type" "catalog"."objective_relationship_type" NOT NULL,
	"strength" "catalog"."relationship_strength" NOT NULL,
	"rationale" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provenance" "catalog"."relationship_provenance" NOT NULL,
	"confidence" numeric(4, 3),
	"validation_status" "catalog"."validation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_objective_relationship" UNIQUE("framework_release_id","source_objective_revision_id","target_objective_revision_id","relationship_type"),
	CONSTRAINT "ck_objective_relationship_no_self" CHECK (source_objective_revision_id <> target_objective_revision_id),
	CONSTRAINT "ck_objective_relationship_confidence" CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "catalog"."objective_revision_transition" (
	"from_objective_revision_id" uuid NOT NULL,
	"to_objective_revision_id" uuid NOT NULL,
	"compatibility" text NOT NULL,
	"rationale" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	CONSTRAINT "objective_revision_transition_from_objective_revision_id_to_objective_revision_id_pk" PRIMARY KEY("from_objective_revision_id","to_objective_revision_id"),
	CONSTRAINT "ck_transition_compatibility" CHECK (compatibility IN ('equivalent', 'evidence_carries_forward', 'requires_revalidation', 'incompatible')),
	CONSTRAINT "ck_transition_no_self" CHECK (from_objective_revision_id <> to_objective_revision_id)
);
--> statement-breakpoint
CREATE TABLE "catalog"."verb_definition" (
	"code" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"definition" text NOT NULL,
	"required_elements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"does_not_establish" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_evidence_channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_mastery_levels" smallint[] DEFAULT ARRAY[1,2,3,4,5]::smallint[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ck_verb_definition_allowed_levels" CHECK (allowed_mastery_levels <@ ARRAY[1,2,3,4,5]::smallint[])
);
--> statement-breakpoint
CREATE TABLE "learning"."asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_canonical_code_unique" UNIQUE("canonical_code")
);
--> statement-breakpoint
CREATE TABLE "learning"."asset_fragment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_revision_id" uuid NOT NULL,
	"fragment_order" integer NOT NULL,
	"title" text,
	"body" text,
	"source_locator" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "uq_asset_fragment_order" UNIQUE("asset_revision_id","fragment_order")
);
--> statement-breakpoint
CREATE TABLE "learning"."asset_objective_alignment" (
	"asset_fragment_id" uuid NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"coverage" text NOT NULL,
	"instructional_strategy" text,
	CONSTRAINT "asset_objective_alignment_asset_fragment_id_objective_revision_id_purpose_pk" PRIMARY KEY("asset_fragment_id","objective_revision_id","purpose"),
	CONSTRAINT "ck_alignment_purpose" CHECK (purpose IN ('teaches', 'practices', 'prepares_for')),
	CONSTRAINT "ck_alignment_coverage" CHECK (coverage IN ('introductory', 'substantial', 'comprehensive'))
);
--> statement-breakpoint
CREATE TABLE "learning"."asset_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"title" text NOT NULL,
	"asset_type" text NOT NULL,
	"source_uri" text,
	"estimated_minutes" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_asset_revision_no" UNIQUE("asset_id","revision_no"),
	CONSTRAINT "ck_asset_revision_no_positive" CHECK (revision_no > 0),
	CONSTRAINT "ck_asset_type" CHECK (asset_type IN ('article', 'video', 'worked_example', 'interactive', 'documentation', 'reference', 'tutorial')),
	CONSTRAINT "ck_asset_estimated_minutes" CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0)
);
--> statement-breakpoint
CREATE TABLE "learner"."profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_subject_id" text,
	"display_name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_external_subject_id_unique" UNIQUE("external_subject_id")
);
--> statement-breakpoint
CREATE TABLE "assessment"."evidence_spec_observable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_spec_id" uuid NOT NULL,
	"code" text NOT NULL,
	"statement" text NOT NULL,
	"observable_type" text NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"sort_order" integer,
	CONSTRAINT "uq_evidence_spec_observable_code" UNIQUE("evidence_spec_id","code"),
	CONSTRAINT "ck_observable_type" CHECK (observable_type IN ('behavior', 'product', 'outcome', 'process', 'explanation', 'judgment'))
);
--> statement-breakpoint
CREATE TABLE "assessment"."learner_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"task_administration_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"attempt_status" text NOT NULL,
	"result_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "ck_attempt_status" CHECK (attempt_status IN ('started', 'submitted', 'completed', 'abandoned', 'invalidated'))
);
--> statement-breakpoint
CREATE TABLE "assessment"."rubric" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubric_canonical_code_unique" UNIQUE("canonical_code")
);
--> statement-breakpoint
CREATE TABLE "assessment"."rubric_criterion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_revision_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"weight" numeric(6, 5) DEFAULT '0' NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"level_anchors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "uq_rubric_criterion_code" UNIQUE("rubric_revision_id","code"),
	CONSTRAINT "ck_rubric_criterion_weight" CHECK (weight BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "assessment"."rubric_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_rubric_revision_no" UNIQUE("rubric_id","revision_no"),
	CONSTRAINT "ck_rubric_revision_no_positive" CHECK (revision_no > 0)
);
--> statement-breakpoint
CREATE TABLE "assessment"."task_administration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_variant_id" uuid NOT NULL,
	"mode" "assessment"."administration_mode" NOT NULL,
	"assistance_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"time_limit_minutes" integer,
	"process_capture_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_administration_time_limit" CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0)
);
--> statement-breakpoint
CREATE TABLE "assessment"."task_objective_evidence_spec" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_revision_id" uuid NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	"claim_role" "assessment"."claim_role" NOT NULL,
	"evidence_strength" "evidence"."evidence_strength" NOT NULL,
	"minimum_independence" smallint NOT NULL,
	"minimum_transfer" "evidence"."transfer_level" NOT NULL,
	"rubric_revision_id" uuid,
	"direct_evidence_required" boolean DEFAULT false NOT NULL,
	"proxy_propagation_allowed" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "uq_task_objective_evidence_spec" UNIQUE("task_revision_id","objective_revision_id"),
	CONSTRAINT "ck_evidence_spec_min_independence" CHECK (minimum_independence BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "assessment"."task_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_template_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"framework_release_id" uuid NOT NULL,
	"title" text NOT NULL,
	"task_kind" "assessment"."task_kind" NOT NULL,
	"scenario" text NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"evidence_ceiling" smallint NOT NULL,
	"estimated_minutes" integer,
	"environment_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_task_revision_no" UNIQUE("task_template_id","revision_no"),
	CONSTRAINT "ck_task_revision_no_positive" CHECK (revision_no > 0),
	CONSTRAINT "ck_task_evidence_ceiling" CHECK (evidence_ceiling BETWEEN 1 AND 5),
	CONSTRAINT "ck_task_estimated_minutes" CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0)
);
--> statement-breakpoint
CREATE TABLE "assessment"."task_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_template_canonical_code_unique" UNIQUE("canonical_code")
);
--> statement-breakpoint
CREATE TABLE "assessment"."task_variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_revision_id" uuid NOT NULL,
	"code" text NOT NULL,
	"variant_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"novelty_default" "evidence"."transfer_level" DEFAULT 'same' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "uq_task_variant_code" UNIQUE("task_revision_id","code")
);
--> statement-breakpoint
CREATE TABLE "evidence"."artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid,
	"attempt_id" uuid,
	"artifact_type" text NOT NULL,
	"storage_uri" text NOT NULL,
	"content_hash" text NOT NULL,
	"media_type" text,
	"classification" text,
	"retention_policy" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence"."observable_result" (
	"evidence_observation_id" uuid NOT NULL,
	"observable_code" text NOT NULL,
	"evidence_spec_id" uuid,
	"result" "evidence"."observation_result" NOT NULL,
	"score" numeric(6, 5),
	"notes" text,
	CONSTRAINT "observable_result_evidence_observation_id_observable_code_pk" PRIMARY KEY("evidence_observation_id","observable_code"),
	CONSTRAINT "ck_observable_result_score" CHECK (score IS NULL OR score BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "evidence"."observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"attempt_id" uuid,
	"objective_revision_id" uuid NOT NULL,
	"evidence_spec_id" uuid,
	"result" "evidence"."observation_result" NOT NULL,
	"evidence_strength" "evidence"."evidence_strength" NOT NULL,
	"origin" "evidence"."evidence_origin" NOT NULL,
	"independence_level" smallint NOT NULL,
	"transfer_level" "evidence"."transfer_level" NOT NULL,
	"rubric_score" numeric(6, 5),
	"machine_verified" boolean DEFAULT false NOT NULL,
	"human_verified" boolean DEFAULT false NOT NULL,
	"source_evidence_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_observation_independence" CHECK (independence_level BETWEEN 0 AND 4),
	CONSTRAINT "ck_observation_rubric_score" CHECK (rubric_score IS NULL OR rubric_score BETWEEN 0 AND 1),
	CONSTRAINT "ck_observation_status" CHECK (status IN ('active', 'voided', 'superseded')),
	CONSTRAINT "ck_observation_origin_source" CHECK ((origin = 'direct' AND source_evidence_id IS NULL) OR (origin = 'proxy' AND source_evidence_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "evidence"."observation_artifact" (
	"evidence_observation_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	CONSTRAINT "observation_artifact_evidence_observation_id_artifact_id_pk" PRIMARY KEY("evidence_observation_id","artifact_id")
);
--> statement-breakpoint
CREATE TABLE "learner"."assertion_evidence" (
	"learner_id" uuid NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	"evidence_observation_id" uuid NOT NULL,
	"contribution_weight" numeric(6, 5) DEFAULT '1' NOT NULL,
	CONSTRAINT "assertion_evidence_learner_id_objective_revision_id_evidence_observation_id_pk" PRIMARY KEY("learner_id","objective_revision_id","evidence_observation_id"),
	CONSTRAINT "ck_assertion_evidence_weight" CHECK (contribution_weight BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "learner"."objective_assertion" (
	"learner_id" uuid NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	"state" "learner"."assertion_state" NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"last_direct_evidence_at" timestamp with time zone,
	"last_any_evidence_at" timestamp with time zone,
	"inference_model_version" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objective_assertion_learner_id_objective_revision_id_pk" PRIMARY KEY("learner_id","objective_revision_id"),
	CONSTRAINT "ck_assertion_confidence" CHECK (confidence BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "qualification"."learner_role_state" (
	"learner_id" uuid NOT NULL,
	"role_level_revision_id" uuid NOT NULL,
	"state" text NOT NULL,
	"readiness_score" numeric(6, 5),
	"requirements_met" integer DEFAULT 0 NOT NULL,
	"requirements_total" integer DEFAULT 0 NOT NULL,
	"blockers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learner_role_state_learner_id_role_level_revision_id_pk" PRIMARY KEY("learner_id","role_level_revision_id"),
	CONSTRAINT "ck_learner_role_state" CHECK (state IN ('not_started', 'in_progress', 'ready_for_review', 'qualified', 'stale', 'revoked')),
	CONSTRAINT "ck_learner_role_readiness" CHECK (readiness_score IS NULL OR readiness_score BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "qualification"."objective_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_group_id" uuid NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	"source_capability_set_revision_id" uuid,
	"direct_evidence_required" boolean DEFAULT false NOT NULL,
	"proxy_evidence_allowed" boolean DEFAULT true NOT NULL,
	"minimum_independence" smallint,
	"minimum_transfer" "evidence"."transfer_level",
	"maximum_evidence_age" interval,
	CONSTRAINT "uq_objective_requirement" UNIQUE("requirement_group_id","objective_revision_id"),
	CONSTRAINT "ck_objective_requirement_independence" CHECK (minimum_independence IS NULL OR minimum_independence BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE "qualification"."requirement_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_level_revision_id" uuid NOT NULL,
	"parent_group_id" uuid,
	"operator" "qualification"."requirement_operator" NOT NULL,
	"minimum_count" integer,
	"label" text,
	"sort_order" integer,
	CONSTRAINT "ck_requirement_group_n_of" CHECK ((operator = 'n_of' AND minimum_count IS NOT NULL AND minimum_count > 0) OR (operator <> 'n_of' AND minimum_count IS NULL))
);
--> statement-breakpoint
CREATE TABLE "qualification"."role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_canonical_code_unique" UNIQUE("canonical_code")
);
--> statement-breakpoint
CREATE TABLE "qualification"."role_level" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"level" smallint NOT NULL,
	"canonical_title" text NOT NULL,
	CONSTRAINT "uq_role_level" UNIQUE("role_id","level"),
	CONSTRAINT "ck_role_level_range" CHECK (level BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "qualification"."role_level_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_level_id" uuid NOT NULL,
	"framework_release_id" uuid NOT NULL,
	"version" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "catalog"."publication_status" DEFAULT 'draft' NOT NULL,
	"extends_role_level_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "uq_role_level_revision_version" UNIQUE("role_level_id","version")
);
--> statement-breakpoint
CREATE TABLE "qualification"."task_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requirement_group_id" uuid NOT NULL,
	"task_revision_id" uuid NOT NULL,
	"minimum_result" "evidence"."observation_result" DEFAULT 'successful' NOT NULL,
	CONSTRAINT "uq_task_requirement" UNIQUE("requirement_group_id","task_revision_id")
);
--> statement-breakpoint
CREATE TABLE "projection"."competency_relationship" (
	"framework_release_id" uuid NOT NULL,
	"source_competency_revision_id" uuid NOT NULL,
	"target_competency_revision_id" uuid NOT NULL,
	"inferred_type" "catalog"."competency_relationship_type" NOT NULL,
	"supporting_edge_count" integer NOT NULL,
	"source_coverage" numeric(6, 5),
	"target_coverage" numeric(6, 5),
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competency_relationship_framework_release_id_source_competency_revision_id_target_competency_revision_id_inferred_type_pk" PRIMARY KEY("framework_release_id","source_competency_revision_id","target_competency_revision_id","inferred_type")
);
--> statement-breakpoint
CREATE TABLE "projection"."frontier_item" (
	"frontier_snapshot_id" uuid NOT NULL,
	"objective_revision_id" uuid NOT NULL,
	"frontier_score" numeric(8, 5) NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommended_action" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "frontier_item_frontier_snapshot_id_objective_revision_id_pk" PRIMARY KEY("frontier_snapshot_id","objective_revision_id")
);
--> statement-breakpoint
CREATE TABLE "projection"."frontier_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"learner_id" uuid NOT NULL,
	"role_level_revision_id" uuid NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projection"."objective_dependency_closure" (
	"framework_release_id" uuid NOT NULL,
	"ancestor_objective_revision_id" uuid NOT NULL,
	"descendant_objective_revision_id" uuid NOT NULL,
	"minimum_depth" integer NOT NULL,
	CONSTRAINT "objective_dependency_closure_framework_release_id_ancestor_objective_revision_id_descendant_objective_revision_id_pk" PRIMARY KEY("framework_release_id","ancestor_objective_revision_id","descendant_objective_revision_id"),
	CONSTRAINT "ck_closure_depth_positive" CHECK (minimum_depth > 0)
);
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_competency_member" ADD CONSTRAINT "capability_set_competency_member_capability_set_revision_id_capability_set_revision_id_fk" FOREIGN KEY ("capability_set_revision_id") REFERENCES "catalog"."capability_set_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_competency_member" ADD CONSTRAINT "capability_set_competency_member_competency_revision_id_competency_revision_id_fk" FOREIGN KEY ("competency_revision_id") REFERENCES "catalog"."competency_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_domain_member" ADD CONSTRAINT "capability_set_domain_member_capability_set_revision_id_capability_set_revision_id_fk" FOREIGN KEY ("capability_set_revision_id") REFERENCES "catalog"."capability_set_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_domain_member" ADD CONSTRAINT "capability_set_domain_member_domain_revision_id_domain_revision_id_fk" FOREIGN KEY ("domain_revision_id") REFERENCES "catalog"."domain_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_nested_member" ADD CONSTRAINT "fk_capability_set_nested_parent" FOREIGN KEY ("parent_capability_set_revision_id") REFERENCES "catalog"."capability_set_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_nested_member" ADD CONSTRAINT "fk_capability_set_nested_child" FOREIGN KEY ("child_capability_set_revision_id") REFERENCES "catalog"."capability_set_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_objective_member" ADD CONSTRAINT "capability_set_objective_member_capability_set_revision_id_capability_set_revision_id_fk" FOREIGN KEY ("capability_set_revision_id") REFERENCES "catalog"."capability_set_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_objective_member" ADD CONSTRAINT "capability_set_objective_member_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_revision" ADD CONSTRAINT "capability_set_revision_capability_set_id_capability_set_id_fk" FOREIGN KEY ("capability_set_id") REFERENCES "catalog"."capability_set"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."capability_set_revision" ADD CONSTRAINT "capability_set_revision_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."competency_objective_membership" ADD CONSTRAINT "competency_objective_membership_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."competency_objective_membership" ADD CONSTRAINT "competency_objective_membership_competency_revision_id_competency_revision_id_fk" FOREIGN KEY ("competency_revision_id") REFERENCES "catalog"."competency_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."competency_objective_membership" ADD CONSTRAINT "competency_objective_membership_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."competency_relationship" ADD CONSTRAINT "competency_relationship_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."competency_relationship" ADD CONSTRAINT "competency_relationship_source_competency_revision_id_competency_revision_id_fk" FOREIGN KEY ("source_competency_revision_id") REFERENCES "catalog"."competency_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."competency_relationship" ADD CONSTRAINT "competency_relationship_target_competency_revision_id_competency_revision_id_fk" FOREIGN KEY ("target_competency_revision_id") REFERENCES "catalog"."competency_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."competency_revision" ADD CONSTRAINT "competency_revision_competency_id_competency_id_fk" FOREIGN KEY ("competency_id") REFERENCES "catalog"."competency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."domain_competency_membership" ADD CONSTRAINT "domain_competency_membership_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."domain_competency_membership" ADD CONSTRAINT "domain_competency_membership_domain_revision_id_domain_revision_id_fk" FOREIGN KEY ("domain_revision_id") REFERENCES "catalog"."domain_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."domain_competency_membership" ADD CONSTRAINT "domain_competency_membership_competency_revision_id_competency_revision_id_fk" FOREIGN KEY ("competency_revision_id") REFERENCES "catalog"."competency_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."domain_revision" ADD CONSTRAINT "domain_revision_domain_id_domain_id_fk" FOREIGN KEY ("domain_id") REFERENCES "catalog"."domain"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."framework_release" ADD CONSTRAINT "framework_release_framework_id_framework_id_fk" FOREIGN KEY ("framework_id") REFERENCES "catalog"."framework"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."framework_release_competency" ADD CONSTRAINT "framework_release_competency_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."framework_release_competency" ADD CONSTRAINT "framework_release_competency_competency_revision_id_competency_revision_id_fk" FOREIGN KEY ("competency_revision_id") REFERENCES "catalog"."competency_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."framework_release_domain" ADD CONSTRAINT "framework_release_domain_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."framework_release_domain" ADD CONSTRAINT "framework_release_domain_domain_revision_id_domain_revision_id_fk" FOREIGN KEY ("domain_revision_id") REFERENCES "catalog"."domain_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."framework_release_objective" ADD CONSTRAINT "framework_release_objective_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."framework_release_objective" ADD CONSTRAINT "framework_release_objective_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."learning_objective_revision" ADD CONSTRAINT "learning_objective_revision_learning_objective_id_learning_objective_id_fk" FOREIGN KEY ("learning_objective_id") REFERENCES "catalog"."learning_objective"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."learning_objective_revision" ADD CONSTRAINT "learning_objective_revision_verb_code_verb_definition_code_fk" FOREIGN KEY ("verb_code") REFERENCES "catalog"."verb_definition"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_evidence_implication" ADD CONSTRAINT "objective_evidence_implication_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_evidence_implication" ADD CONSTRAINT "objective_evidence_implication_source_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("source_objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_evidence_implication" ADD CONSTRAINT "objective_evidence_implication_target_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("target_objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_relationship" ADD CONSTRAINT "objective_relationship_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_relationship" ADD CONSTRAINT "objective_relationship_source_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("source_objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_relationship" ADD CONSTRAINT "objective_relationship_target_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("target_objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_revision_transition" ADD CONSTRAINT "objective_revision_transition_from_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("from_objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog"."objective_revision_transition" ADD CONSTRAINT "objective_revision_transition_to_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("to_objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."asset_fragment" ADD CONSTRAINT "asset_fragment_asset_revision_id_asset_revision_id_fk" FOREIGN KEY ("asset_revision_id") REFERENCES "learning"."asset_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."asset_objective_alignment" ADD CONSTRAINT "asset_objective_alignment_asset_fragment_id_asset_fragment_id_fk" FOREIGN KEY ("asset_fragment_id") REFERENCES "learning"."asset_fragment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."asset_objective_alignment" ADD CONSTRAINT "asset_objective_alignment_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning"."asset_revision" ADD CONSTRAINT "asset_revision_asset_id_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "learning"."asset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."evidence_spec_observable" ADD CONSTRAINT "evidence_spec_observable_evidence_spec_id_task_objective_evidence_spec_id_fk" FOREIGN KEY ("evidence_spec_id") REFERENCES "assessment"."task_objective_evidence_spec"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."learner_attempt" ADD CONSTRAINT "learner_attempt_learner_id_profile_id_fk" FOREIGN KEY ("learner_id") REFERENCES "learner"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."learner_attempt" ADD CONSTRAINT "learner_attempt_task_administration_id_task_administration_id_fk" FOREIGN KEY ("task_administration_id") REFERENCES "assessment"."task_administration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."rubric_criterion" ADD CONSTRAINT "rubric_criterion_rubric_revision_id_rubric_revision_id_fk" FOREIGN KEY ("rubric_revision_id") REFERENCES "assessment"."rubric_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."rubric_revision" ADD CONSTRAINT "rubric_revision_rubric_id_rubric_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "assessment"."rubric"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_administration" ADD CONSTRAINT "task_administration_task_variant_id_task_variant_id_fk" FOREIGN KEY ("task_variant_id") REFERENCES "assessment"."task_variant"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_objective_evidence_spec" ADD CONSTRAINT "task_objective_evidence_spec_task_revision_id_task_revision_id_fk" FOREIGN KEY ("task_revision_id") REFERENCES "assessment"."task_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_objective_evidence_spec" ADD CONSTRAINT "task_objective_evidence_spec_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_objective_evidence_spec" ADD CONSTRAINT "task_objective_evidence_spec_rubric_revision_id_rubric_revision_id_fk" FOREIGN KEY ("rubric_revision_id") REFERENCES "assessment"."rubric_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_revision" ADD CONSTRAINT "task_revision_task_template_id_task_template_id_fk" FOREIGN KEY ("task_template_id") REFERENCES "assessment"."task_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_revision" ADD CONSTRAINT "task_revision_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment"."task_variant" ADD CONSTRAINT "task_variant_task_revision_id_task_revision_id_fk" FOREIGN KEY ("task_revision_id") REFERENCES "assessment"."task_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."artifact" ADD CONSTRAINT "artifact_learner_id_profile_id_fk" FOREIGN KEY ("learner_id") REFERENCES "learner"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."artifact" ADD CONSTRAINT "artifact_attempt_id_learner_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "assessment"."learner_attempt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observable_result" ADD CONSTRAINT "observable_result_evidence_observation_id_observation_id_fk" FOREIGN KEY ("evidence_observation_id") REFERENCES "evidence"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observable_result" ADD CONSTRAINT "fk_observable_result_spec_observable" FOREIGN KEY ("evidence_spec_id","observable_code") REFERENCES "assessment"."evidence_spec_observable"("evidence_spec_id","code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation" ADD CONSTRAINT "observation_learner_id_profile_id_fk" FOREIGN KEY ("learner_id") REFERENCES "learner"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation" ADD CONSTRAINT "observation_attempt_id_learner_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "assessment"."learner_attempt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation" ADD CONSTRAINT "observation_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation" ADD CONSTRAINT "observation_evidence_spec_id_task_objective_evidence_spec_id_fk" FOREIGN KEY ("evidence_spec_id") REFERENCES "assessment"."task_objective_evidence_spec"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation" ADD CONSTRAINT "observation_source_evidence_id_observation_id_fk" FOREIGN KEY ("source_evidence_id") REFERENCES "evidence"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation_artifact" ADD CONSTRAINT "observation_artifact_evidence_observation_id_observation_id_fk" FOREIGN KEY ("evidence_observation_id") REFERENCES "evidence"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence"."observation_artifact" ADD CONSTRAINT "observation_artifact_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "evidence"."artifact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner"."assertion_evidence" ADD CONSTRAINT "assertion_evidence_evidence_observation_id_observation_id_fk" FOREIGN KEY ("evidence_observation_id") REFERENCES "evidence"."observation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner"."assertion_evidence" ADD CONSTRAINT "fk_assertion_evidence_assertion" FOREIGN KEY ("learner_id","objective_revision_id") REFERENCES "learner"."objective_assertion"("learner_id","objective_revision_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion" ADD CONSTRAINT "objective_assertion_learner_id_profile_id_fk" FOREIGN KEY ("learner_id") REFERENCES "learner"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner"."objective_assertion" ADD CONSTRAINT "objective_assertion_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."learner_role_state" ADD CONSTRAINT "learner_role_state_learner_id_profile_id_fk" FOREIGN KEY ("learner_id") REFERENCES "learner"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."learner_role_state" ADD CONSTRAINT "learner_role_state_role_level_revision_id_role_level_revision_id_fk" FOREIGN KEY ("role_level_revision_id") REFERENCES "qualification"."role_level_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement" ADD CONSTRAINT "objective_requirement_requirement_group_id_requirement_group_id_fk" FOREIGN KEY ("requirement_group_id") REFERENCES "qualification"."requirement_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement" ADD CONSTRAINT "objective_requirement_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."objective_requirement" ADD CONSTRAINT "objective_requirement_source_capability_set_revision_id_capability_set_revision_id_fk" FOREIGN KEY ("source_capability_set_revision_id") REFERENCES "catalog"."capability_set_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."requirement_group" ADD CONSTRAINT "requirement_group_role_level_revision_id_role_level_revision_id_fk" FOREIGN KEY ("role_level_revision_id") REFERENCES "qualification"."role_level_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."requirement_group" ADD CONSTRAINT "requirement_group_parent_group_id_requirement_group_id_fk" FOREIGN KEY ("parent_group_id") REFERENCES "qualification"."requirement_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."role_level" ADD CONSTRAINT "role_level_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "qualification"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."role_level_revision" ADD CONSTRAINT "role_level_revision_role_level_id_role_level_id_fk" FOREIGN KEY ("role_level_id") REFERENCES "qualification"."role_level"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."role_level_revision" ADD CONSTRAINT "role_level_revision_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."role_level_revision" ADD CONSTRAINT "role_level_revision_extends_role_level_revision_id_role_level_revision_id_fk" FOREIGN KEY ("extends_role_level_revision_id") REFERENCES "qualification"."role_level_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."task_requirement" ADD CONSTRAINT "task_requirement_requirement_group_id_requirement_group_id_fk" FOREIGN KEY ("requirement_group_id") REFERENCES "qualification"."requirement_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification"."task_requirement" ADD CONSTRAINT "task_requirement_task_revision_id_task_revision_id_fk" FOREIGN KEY ("task_revision_id") REFERENCES "assessment"."task_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."competency_relationship" ADD CONSTRAINT "competency_relationship_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."competency_relationship" ADD CONSTRAINT "competency_relationship_source_competency_revision_id_competency_revision_id_fk" FOREIGN KEY ("source_competency_revision_id") REFERENCES "catalog"."competency_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."competency_relationship" ADD CONSTRAINT "competency_relationship_target_competency_revision_id_competency_revision_id_fk" FOREIGN KEY ("target_competency_revision_id") REFERENCES "catalog"."competency_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."frontier_item" ADD CONSTRAINT "frontier_item_frontier_snapshot_id_frontier_snapshot_id_fk" FOREIGN KEY ("frontier_snapshot_id") REFERENCES "projection"."frontier_snapshot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."frontier_item" ADD CONSTRAINT "frontier_item_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."frontier_snapshot" ADD CONSTRAINT "frontier_snapshot_learner_id_profile_id_fk" FOREIGN KEY ("learner_id") REFERENCES "learner"."profile"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."frontier_snapshot" ADD CONSTRAINT "frontier_snapshot_role_level_revision_id_role_level_revision_id_fk" FOREIGN KEY ("role_level_revision_id") REFERENCES "qualification"."role_level_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."objective_dependency_closure" ADD CONSTRAINT "objective_dependency_closure_framework_release_id_framework_release_id_fk" FOREIGN KEY ("framework_release_id") REFERENCES "catalog"."framework_release"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."objective_dependency_closure" ADD CONSTRAINT "objective_dependency_closure_ancestor_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("ancestor_objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projection"."objective_dependency_closure" ADD CONSTRAINT "objective_dependency_closure_descendant_objective_revision_id_learning_objective_revision_id_fk" FOREIGN KEY ("descendant_objective_revision_id") REFERENCES "catalog"."learning_objective_revision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_objective_primary_competency_per_release" ON "catalog"."competency_objective_membership" USING btree ("framework_release_id","objective_revision_id") WHERE membership_role = 'primary';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_competency_primary_domain_per_release" ON "catalog"."domain_competency_membership" USING btree ("framework_release_id","competency_revision_id") WHERE membership_role = 'primary';--> statement-breakpoint
CREATE INDEX "ix_objective_relationship_source" ON "catalog"."objective_relationship" USING btree ("framework_release_id","source_objective_revision_id");--> statement-breakpoint
CREATE INDEX "ix_objective_relationship_target" ON "catalog"."objective_relationship" USING btree ("framework_release_id","target_objective_revision_id");--> statement-breakpoint
CREATE INDEX "ix_attempt_learner_started" ON "assessment"."learner_attempt" USING btree ("learner_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_evidence_spec_objective" ON "assessment"."task_objective_evidence_spec" USING btree ("objective_revision_id");--> statement-breakpoint
CREATE INDEX "ix_evidence_learner_objective_time" ON "evidence"."observation" USING btree ("learner_id","objective_revision_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_evidence_source" ON "evidence"."observation" USING btree ("source_evidence_id");--> statement-breakpoint
CREATE INDEX "ix_evidence_attempt" ON "evidence"."observation" USING btree ("attempt_id");