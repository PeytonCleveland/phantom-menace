-- ---------------------------------------------------------------------------
-- Evidence semantics governance (spec §1, §8).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.canonical_context_key(contexts jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(
    string_agg(key || '=' || value, ';' ORDER BY key),
    ''
  )
  FROM jsonb_each_text(coalesce(contexts, '{}'::jsonb)) AS t(key, value);
$$;
--> statement-breakpoint

-- A context value's parent must belong to the same dimension, and the parent
-- chain must be acyclic. Both matter because qualification walks the chain.
CREATE OR REPLACE FUNCTION governance.enforce_context_value_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_dimension text;
  cursor_id uuid;
  hops integer := 0;
BEGIN
  IF NEW.parent_value_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT dimension_code INTO parent_dimension
  FROM catalog.context_value WHERE id = NEW.parent_value_id;

  IF parent_dimension IS DISTINCT FROM NEW.dimension_code THEN
    RAISE EXCEPTION 'context value % parent belongs to dimension %, not %',
      NEW.code, parent_dimension, NEW.dimension_code;
  END IF;

  cursor_id := NEW.parent_value_id;
  WHILE cursor_id IS NOT NULL LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'context value % would create a parent cycle', NEW.code;
    END IF;
    hops := hops + 1;
    IF hops > 32 THEN
      RAISE EXCEPTION 'context value parent chain for % exceeds 32 hops', NEW.code;
    END IF;
    SELECT parent_value_id INTO cursor_id FROM catalog.context_value WHERE id = cursor_id;
  END LOOP;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_context_value_hierarchy
BEFORE INSERT OR UPDATE ON catalog.context_value
FOR EACH ROW EXECUTE FUNCTION governance.enforce_context_value_hierarchy();
