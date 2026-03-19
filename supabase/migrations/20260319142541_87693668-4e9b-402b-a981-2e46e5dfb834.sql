CREATE OR REPLACE FUNCTION public.calculate_income_record_netto()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.netto := COALESCE(NEW.aandeel_arts, 0) - COALESCE(NEW.bouwfonds, 0) - COALESCE(NEW.mif, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_income_record_netto ON public.income_records;

CREATE TRIGGER trg_calculate_income_record_netto
BEFORE INSERT OR UPDATE ON public.income_records
FOR EACH ROW
EXECUTE FUNCTION public.calculate_income_record_netto();