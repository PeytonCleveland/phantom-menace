-- ---------------------------------------------------------------------------
-- Evidence semantics governance (spec §1, §8).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION governance.canonical_context_key(contexts jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- ORDER BY key COLLATE "C" forces byte ordering, matching the TypeScript
  -- mirror's Array.prototype.sort(). The default en_US.utf8 collation treats
  -- `_` as near-ignorable punctuation, so e.g. "cloudiness" and
  -- "cloud_provider" sort in the opposite order under it than under "C" --
  -- a divergence between this function and the TS mirror would mint
  -- duplicate learner-assertion rows keyed on what should be the same
  -- canonical context. "C" is also required for IMMUTABLE to be honest: a
  -- locale-dependent collation's ordering can shift under a glibc/ICU
  -- upgrade, which the "C" collation's fixed byte ordering cannot.
  --
  -- Note: a context value of JSON null (e.g. {"cloud_provider": null}) is
  -- silently dropped by jsonb_each_text/string_agg and collapses to the
  -- empty-context key ''. This is left unguarded because it is unreachable
  -- through the real write path: assertion recalculation builds this jsonb
  -- from observation_context rows whose context_value_id is NOT NULL.
  SELECT coalesce(
    string_agg(key || '=' || value, ';' ORDER BY key COLLATE "C"),
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
