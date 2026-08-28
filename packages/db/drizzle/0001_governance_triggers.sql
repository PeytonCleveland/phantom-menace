-- ---------------------------------------------------------------------------
-- Lighthouse governance layer (spec §13.3, §13.5, §13.6, §21)
-- Trigger functions live in the `governance` schema. These rules are the
-- database backstop; richer validation belongs in the service layer.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS "governance";
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- §13.6 Evidence immutability: append-only observations.
-- Allowed: status transition active -> voided | superseded, nothing else.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.enforce_observation_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'evidence.observation rows are append-only and cannot be deleted (id=%)', OLD.id;
  END IF;

  IF OLD.status <> 'active' THEN
    RAISE EXCEPTION 'evidence.observation % has status % and cannot be modified', OLD.id, OLD.status;
  END IF;

  IF NEW.status NOT IN ('voided', 'superseded') THEN
    RAISE EXCEPTION 'evidence.observation % may only transition from active to voided or superseded', OLD.id;
  END IF;

  IF (to_jsonb(NEW) - 'status') <> (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'evidence.observation % content is immutable; only status may change', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_observation_append_only
BEFORE UPDATE OR DELETE ON evidence.observation
FOR EACH ROW EXECUTE FUNCTION governance.enforce_observation_append_only();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- §13.5 Published immutability for status-bearing revision/release tables.
-- Published rows may only transition status -> retired; retired rows and all
-- other columns are frozen. Applied to framework_release,
-- capability_set_revision, and role_level_revision.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.enforce_published_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published', 'retired') THEN
      RAISE EXCEPTION '%.% row % is % and cannot be deleted',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.id, OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'retired' THEN
    RAISE EXCEPTION '%.% row % is retired and immutable',
      TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.id;
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status <> 'retired' OR (to_jsonb(NEW) - 'status') <> (to_jsonb(OLD) - 'status') THEN
      RAISE EXCEPTION '%.% row % is published and immutable except status -> retired',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_framework_release_immutability
BEFORE UPDATE OR DELETE ON catalog.framework_release
FOR EACH ROW EXECUTE FUNCTION governance.enforce_published_immutability();
--> statement-breakpoint

CREATE TRIGGER trg_capability_set_revision_immutability
BEFORE UPDATE OR DELETE ON catalog.capability_set_revision
FOR EACH ROW EXECUTE FUNCTION governance.enforce_published_immutability();
--> statement-breakpoint

CREATE TRIGGER trg_role_level_revision_immutability
BEFORE UPDATE OR DELETE ON qualification.role_level_revision
FOR EACH ROW EXECUTE FUNCTION governance.enforce_published_immutability();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- §13.5 Content-revision immutability: a domain/competency/objective revision
-- that is a member of a published framework release is frozen.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.enforce_domain_revision_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM catalog.framework_release_domain frd
    JOIN catalog.framework_release fr ON fr.id = frd.framework_release_id
    WHERE frd.domain_revision_id = OLD.id
      AND fr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'catalog.domain_revision % belongs to a published release and is immutable', OLD.id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_domain_revision_immutability
BEFORE UPDATE OR DELETE ON catalog.domain_revision
FOR EACH ROW EXECUTE FUNCTION governance.enforce_domain_revision_immutability();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION governance.enforce_competency_revision_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM catalog.framework_release_competency frc
    JOIN catalog.framework_release fr ON fr.id = frc.framework_release_id
    WHERE frc.competency_revision_id = OLD.id
      AND fr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'catalog.competency_revision % belongs to a published release and is immutable', OLD.id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_competency_revision_immutability
BEFORE UPDATE OR DELETE ON catalog.competency_revision
FOR EACH ROW EXECUTE FUNCTION governance.enforce_competency_revision_immutability();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION governance.enforce_objective_revision_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM catalog.framework_release_objective fro
    JOIN catalog.framework_release fr ON fr.id = fro.framework_release_id
    WHERE fro.objective_revision_id = OLD.id
      AND fr.status IN ('published', 'retired')
  ) THEN
    RAISE EXCEPTION 'catalog.learning_objective_revision % belongs to a published release and is immutable', OLD.id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_objective_revision_immutability
BEFORE UPDATE OR DELETE ON catalog.learning_objective_revision
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_revision_immutability();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- §13.3 Hard performance_requires edges must be acyclic.
-- Adding edge S -> T is rejected when T already reaches S through hard
-- performance_requires edges in the same framework release.
-- Note: concurrent inserts can evade a row trigger; the projection rebuild
-- (dependency closure) revalidates acyclicity as a second line of defense.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.enforce_objective_relationship_acyclicity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cycle_found boolean;
BEGIN
  IF NEW.relationship_type <> 'performance_requires' OR NEW.strength <> 'hard' THEN
    RETURN NEW;
  END IF;

  WITH RECURSIVE reachable AS (
    SELECT NEW.target_objective_revision_id AS node
    UNION
    SELECT r.target_objective_revision_id
    FROM catalog.objective_relationship r
    JOIN reachable ON r.source_objective_revision_id = reachable.node
    WHERE r.framework_release_id = NEW.framework_release_id
      AND r.relationship_type = 'performance_requires'
      AND r.strength = 'hard'
  )
  SELECT EXISTS (
    SELECT 1 FROM reachable WHERE node = NEW.source_objective_revision_id
  ) INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'hard performance_requires edge % -> % would create a cycle',
      NEW.source_objective_revision_id, NEW.target_objective_revision_id;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_objective_relationship_acyclic
BEFORE INSERT OR UPDATE ON catalog.objective_relationship
FOR EACH ROW EXECUTE FUNCTION governance.enforce_objective_relationship_acyclicity();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- §21 Nested capability sets must be acyclic.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.enforce_capability_set_acyclicity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cycle_found boolean;
BEGIN
  WITH RECURSIVE descendants AS (
    SELECT NEW.child_capability_set_revision_id AS node
    UNION
    SELECT m.child_capability_set_revision_id
    FROM catalog.capability_set_nested_member m
    JOIN descendants d ON m.parent_capability_set_revision_id = d.node
  )
  SELECT EXISTS (
    SELECT 1 FROM descendants WHERE node = NEW.parent_capability_set_revision_id
  ) INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'capability set nesting % -> % would create a cycle',
      NEW.parent_capability_set_revision_id, NEW.child_capability_set_revision_id;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_capability_set_acyclic
BEFORE INSERT OR UPDATE ON catalog.capability_set_nested_member
FOR EACH ROW EXECUTE FUNCTION governance.enforce_capability_set_acyclicity();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Requirement-group tree integrity: parent must belong to the same
-- role_level_revision (gap in the spec DDL, §12.19).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.enforce_requirement_group_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_group_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM qualification.requirement_group g
      WHERE g.id = NEW.parent_group_id
        AND g.role_level_revision_id = NEW.role_level_revision_id
    ) THEN
      RAISE EXCEPTION 'requirement_group parent % must belong to role_level_revision %',
        NEW.parent_group_id, NEW.role_level_revision_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_requirement_group_parent
BEFORE INSERT OR UPDATE ON qualification.requirement_group
FOR EACH ROW EXECUTE FUNCTION governance.enforce_requirement_group_parent();
