ALTER TABLE public.income_records
  ADD COLUMN IF NOT EXISTS associatie_share_applied boolean NOT NULL DEFAULT false;

UPDATE public.income_records
SET
  total_amount = ROUND(COALESCE(total_amount, 0) * 0.5, 2),
  aandeel_arts = ROUND(COALESCE(aandeel_arts, 0) * 0.5, 2),
  bouwfonds = ROUND(COALESCE(bouwfonds, 0) * 0.5, 2),
  mif = ROUND(COALESCE(mif, 0) * 0.5, 2),
  netto = ROUND(COALESCE(netto, 0) * 0.5, 2),
  unit_amount = ROUND(COALESCE(unit_amount, 0) * 0.5, 2),
  associatie_share_applied = true
WHERE income_type = 'associatie'
  AND associatie_share_applied = false;

CREATE OR REPLACE FUNCTION public.normalize_associatie_share()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.income_type = 'associatie' AND COALESCE(NEW.associatie_share_applied, false) = false THEN
    NEW.total_amount := ROUND(COALESCE(NEW.total_amount, 0) * 0.5, 2);
    NEW.aandeel_arts := ROUND(COALESCE(NEW.aandeel_arts, 0) * 0.5, 2);
    NEW.bouwfonds := ROUND(COALESCE(NEW.bouwfonds, 0) * 0.5, 2);
    NEW.mif := ROUND(COALESCE(NEW.mif, 0) * 0.5, 2);
    NEW.netto := ROUND(COALESCE(NEW.netto, 0) * 0.5, 2);
    NEW.unit_amount := ROUND(COALESCE(NEW.unit_amount, 0) * 0.5, 2);
    NEW.associatie_share_applied := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_associatie_share ON public.income_records;
CREATE TRIGGER trg_normalize_associatie_share
BEFORE INSERT OR UPDATE OF income_type, total_amount, aandeel_arts, bouwfonds, mif, netto, unit_amount, associatie_share_applied
ON public.income_records
FOR EACH ROW
EXECUTE FUNCTION public.normalize_associatie_share();