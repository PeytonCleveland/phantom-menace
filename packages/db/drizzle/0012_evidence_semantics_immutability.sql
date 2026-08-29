-- ---------------------------------------------------------------------------
-- Immutability for the child rows this pass introduced (spec §8).
--
-- enforce_objective_revision_immutability (0001) freezes the PARENT row of a
-- published objective revision and nothing else. Mutating these children
-- retroactively changes what already-recorded evidence meant.
--
-- Every parent-keyed function below checks BOTH the OLD and the NEW parent
-- key on UPDATE, not just NEW: checking only NEW leaves an escape where an
-- UPDATE silently re-parents a row away from a frozen parent onto an
-- unfrozen one (or the reverse) without ever raising, since the NEW-side
-- EXISTS check alone has nothing to say about where the row is leaving FROM.
-- ---------------------------------------------------------------------------

-- Covers INSERT as well as UPDATE/DELETE: adding a criterion, context policy,
-- allowed value, or claim-evidence constraint to a published objective
-- revision changes what that revision claims just as much as editing one
-- does. Safe for the seed because every such row is written before
-- publishRelease runs, while the release is still 'draft'.
CREATE OR REPLACE FUNCTION governance.enforce_objective_child_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_revision uuid;
  new_revision uuid;
BEGIN
  old_revision := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.objective_revision_id END;
  new_revision := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.objective_revision_id END;

  IF old_revision IS NOT NULL AND EXISTS (
    SELECT 1
    FROM catalog.framework_release_objective fro
    JOIN catalog.framework_release fr ON fr.id = fro.framework_release_id
    WHERE fro.objective_revision_id = old_revision
      AND fr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'objective revision % is published - its % rows are frozen',
      old_revision, TG_TABLE_NAME;
  END IF;

  IF new_revision IS NOT NULL AND new_revision IS DISTINCT FROM old_revision AND EXISTS (
    SELECT 1
    FROM catalog.framework_release_objective fro
    JOIN catalog.framework_release fr ON fr.id = fro.framework_release_id
    WHERE fro.objective_revision_id = new_revision
      AND fr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'objective revision % is published - its % rows are frozen',
      new_revision, TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_objective_criterion_immutability
BEFORE INSERT OR UPDATE OR DELETE ON catalog.objective_criterion
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_child_immutability();
--> statement-breakpoint

CREATE TRIGGER trg_objective_context_policy_immutability
BEFORE INSERT OR UPDATE OR DELETE ON catalog.objective_context_policy
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_child_immutability();
--> statement-breakpoint

CREATE TRIGGER trg_objective_context_allowed_value_immutability
BEFORE INSERT OR UPDATE OR DELETE ON catalog.objective_context_allowed_value
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_child_immutability();
--> statement-breakpoint

CREATE TRIGGER trg_objective_claim_constraint_immutability
BEFORE INSERT OR UPDATE OR DELETE ON catalog.objective_claim_evidence_constraint
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_child_immutability();
--> statement-breakpoint

-- Implication criteria freeze with their implication's release: changing
-- which criteria gate a proxy rule changes the meaning of every proxy
-- observation already derived through it. UPDATE/DELETE only: creation
-- happens through createEvidenceImplication before the release is
-- published, and nothing else ever inserts here.
CREATE OR REPLACE FUNCTION governance.enforce_implication_criterion_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_implication uuid;
  new_implication uuid;
BEGIN
  old_implication := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.implication_id END;
  new_implication := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.implication_id END;

  IF old_implication IS NOT NULL AND EXISTS (
    SELECT 1
    FROM catalog.objective_evidence_implication i
    JOIN catalog.framework_release fr ON fr.id = i.framework_release_id
    WHERE i.id = old_implication
      AND fr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'implication belongs to a published release - its criteria are frozen';
  END IF;

  IF new_implication IS NOT NULL AND new_implication IS DISTINCT FROM old_implication AND EXISTS (
    SELECT 1
    FROM catalog.objective_evidence_implication i
    JOIN catalog.framework_release fr ON fr.id = i.framework_release_id
    WHERE i.id = new_implication
      AND fr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'implication belongs to a published release - its criteria are frozen';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_implication_criterion_immutability
BEFORE UPDATE OR DELETE ON catalog.objective_evidence_implication_criterion
FOR EACH ROW EXECUTE FUNCTION governance.enforce_implication_criterion_immutability();
--> statement-breakpoint

-- Criterion mappings and variant contexts freeze once evidence exists under
-- the owning task revision. A task revision has no published state of its
-- own; what makes these load-bearing is recorded attempts. Covers INSERT
-- too: mapping a criterion onto an observable after attempts already exist
-- would make an already-recorded observation retroactively satisfy an
-- additional criterion it was never evaluated against. Safe for the seed:
-- createTask inserts these before any learner_attempt exists.
CREATE OR REPLACE FUNCTION governance.enforce_observable_mapping_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_observable uuid;
  new_observable uuid;
BEGIN
  old_observable := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.evidence_spec_observable_id END;
  new_observable := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.evidence_spec_observable_id END;

  IF old_observable IS NOT NULL AND EXISTS (
    SELECT 1
    FROM assessment.evidence_spec_observable obs
    JOIN assessment.task_objective_evidence_spec spec ON spec.id = obs.evidence_spec_id
    JOIN assessment.task_variant tv ON tv.task_revision_id = spec.task_revision_id
    JOIN assessment.task_administration ta ON ta.task_variant_id = tv.id
    JOIN assessment.learner_attempt att ON att.task_administration_id = ta.id
    WHERE obs.id = old_observable
  ) THEN
    RAISE EXCEPTION 'observable has recorded attempts - its criterion mapping is frozen';
  END IF;

  IF new_observable IS NOT NULL AND new_observable IS DISTINCT FROM old_observable AND EXISTS (
    SELECT 1
    FROM assessment.evidence_spec_observable obs
    JOIN assessment.task_objective_evidence_spec spec ON spec.id = obs.evidence_spec_id
    JOIN assessment.task_variant tv ON tv.task_revision_id = spec.task_revision_id
    JOIN assessment.task_administration ta ON ta.task_variant_id = tv.id
    JOIN assessment.learner_attempt att ON att.task_administration_id = ta.id
    WHERE obs.id = new_observable
  ) THEN
    RAISE EXCEPTION 'observable has recorded attempts - its criterion mapping is frozen';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_observable_criterion_mapping_immutability
BEFORE INSERT OR UPDATE OR DELETE ON assessment.observable_criterion_mapping
FOR EACH ROW EXECUTE FUNCTION governance.enforce_observable_mapping_immutability();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION governance.enforce_variant_context_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_variant uuid;
  new_variant uuid;
BEGIN
  old_variant := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.task_variant_id END;
  new_variant := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.task_variant_id END;

  IF old_variant IS NOT NULL AND EXISTS (
    SELECT 1
    FROM assessment.task_administration ta
    JOIN assessment.learner_attempt att ON att.task_administration_id = ta.id
    WHERE ta.task_variant_id = old_variant
  ) THEN
    RAISE EXCEPTION 'variant has recorded attempts - its context is frozen';
  END IF;

  IF new_variant IS NOT NULL AND new_variant IS DISTINCT FROM old_variant AND EXISTS (
    SELECT 1
    FROM assessment.task_administration ta
    JOIN assessment.learner_attempt att ON att.task_administration_id = ta.id
    WHERE ta.task_variant_id = new_variant
  ) THEN
    RAISE EXCEPTION 'variant has recorded attempts - its context is frozen';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_task_variant_context_immutability
BEFORE INSERT OR UPDATE OR DELETE ON assessment.task_variant_context
FOR EACH ROW EXECUTE FUNCTION governance.enforce_variant_context_immutability();
--> statement-breakpoint

-- Requirement contexts freeze with their published role level revision.
CREATE OR REPLACE FUNCTION governance.enforce_requirement_context_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_requirement uuid;
  new_requirement uuid;
BEGIN
  old_requirement := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.objective_requirement_id END;
  new_requirement := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.objective_requirement_id END;

  IF old_requirement IS NOT NULL AND EXISTS (
    SELECT 1
    FROM qualification.objective_requirement oreq
    JOIN qualification.requirement_group g ON g.id = oreq.requirement_group_id
    JOIN qualification.role_level_revision rlr ON rlr.id = g.role_level_revision_id
    WHERE oreq.id = old_requirement
      AND rlr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'role level revision is published - its requirement contexts are frozen';
  END IF;

  IF new_requirement IS NOT NULL AND new_requirement IS DISTINCT FROM old_requirement AND EXISTS (
    SELECT 1
    FROM qualification.objective_requirement oreq
    JOIN qualification.requirement_group g ON g.id = oreq.requirement_group_id
    JOIN qualification.role_level_revision rlr ON rlr.id = g.role_level_revision_id
    WHERE oreq.id = new_requirement
      AND rlr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'role level revision is published - its requirement contexts are frozen';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_requirement_context_immutability
BEFORE UPDATE OR DELETE ON qualification.objective_requirement_context
FOR EACH ROW EXECUTE FUNCTION governance.enforce_requirement_context_immutability();
--> statement-breakpoint

-- Context values carry evidence semantics: context_key stores value CODES and
-- qualification walks the parent chain. Re-parenting aws_govcloud after
-- qualifications have been evaluated would retroactively alter which evidence
-- satisfies which requirement. name/description/active stay mutable.
CREATE OR REPLACE FUNCTION governance.enforce_context_value_semantics_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.dimension_code IS NOT DISTINCT FROM OLD.dimension_code
     AND NEW.code IS NOT DISTINCT FROM OLD.code
     AND NEW.parent_value_id IS NOT DISTINCT FROM OLD.parent_value_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM evidence.observation_context WHERE context_value_id = OLD.id)
     OR EXISTS (SELECT 1 FROM learner.objective_assertion_context WHERE context_value_id = OLD.id)
     OR EXISTS (SELECT 1 FROM qualification.objective_requirement_context WHERE context_value_id = OLD.id)
     OR EXISTS (SELECT 1 FROM assessment.task_variant_context WHERE context_value_id = OLD.id)
     OR EXISTS (SELECT 1 FROM catalog.objective_context_allowed_value WHERE context_value_id = OLD.id)
  THEN
    RAISE EXCEPTION 'context value % is referenced - dimension, code, and parent are frozen', OLD.code;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_context_value_semantics_immutability
BEFORE UPDATE ON catalog.context_value
FOR EACH ROW EXECUTE FUNCTION governance.enforce_context_value_semantics_immutability();
