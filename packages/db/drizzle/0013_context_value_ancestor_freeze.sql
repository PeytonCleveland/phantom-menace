-- ---------------------------------------------------------------------------
-- Close a re-parent escape in the context-value semantics freeze (0012).
--
-- The 0012 trigger checked only whether OLD.id itself was referenced, so
-- re-parenting an UNREFERENCED ANCESTOR of a referenced value passed through
-- untouched. With top -> mid -> leaf and only `leaf` referenced, re-parenting
-- `mid` onto an unrelated sibling silently changed which evidence satisfies
-- which requirement for every descendant of `mid` (spec §1, §8): parentage
-- carries evidence semantics for the whole subtree beneath a value, not just
-- for the value directly referenced.
--
-- Fix: treat a reference to ANY DESCENDANT of OLD (including OLD itself) as
-- a reference to OLD, by recursing the descendant closure before checking.
-- ---------------------------------------------------------------------------

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

  IF EXISTS (
    WITH RECURSIVE descendant AS (
      SELECT cv.id
      FROM catalog.context_value cv
      WHERE cv.id = OLD.id
      UNION ALL
      SELECT child.id
      FROM catalog.context_value child
      JOIN descendant d ON child.parent_value_id = d.id
    )
    SELECT 1 FROM descendant d
    WHERE EXISTS (SELECT 1 FROM evidence.observation_context WHERE context_value_id = d.id)
       OR EXISTS (SELECT 1 FROM learner.objective_assertion_context WHERE context_value_id = d.id)
       OR EXISTS (SELECT 1 FROM qualification.objective_requirement_context WHERE context_value_id = d.id)
       OR EXISTS (SELECT 1 FROM assessment.task_variant_context WHERE context_value_id = d.id)
       OR EXISTS (SELECT 1 FROM catalog.objective_context_allowed_value WHERE context_value_id = d.id)
  )
  THEN
    RAISE EXCEPTION 'context value % is referenced (directly or through a descendant) - dimension, code, and parent are frozen', OLD.code;
  END IF;

  RETURN NEW;
END;
$$;
