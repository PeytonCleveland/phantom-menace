-- An administration can never support more than the task was designed for.
CREATE OR REPLACE FUNCTION governance.enforce_administration_ceiling()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  design_ceiling smallint;
BEGIN
  SELECT tr.design_evidence_ceiling INTO design_ceiling
  FROM assessment.task_variant tv
  JOIN assessment.task_revision tr ON tr.id = tv.task_revision_id
  WHERE tv.id = NEW.task_variant_id;

  IF NEW.effective_evidence_ceiling > design_ceiling THEN
    RAISE EXCEPTION 'administration effective ceiling L% exceeds task design ceiling L%',
      NEW.effective_evidence_ceiling, design_ceiling;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_administration_ceiling
BEFORE INSERT OR UPDATE ON assessment.task_administration
FOR EACH ROW EXECUTE FUNCTION governance.enforce_administration_ceiling();
