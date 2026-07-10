-- Verwijder duplicaten in income_records. Behoud 1 rij per
-- (user_id, income_type, record_date, nomenclature_code). Tie-break op id
-- omdat sommige duplicaten identieke created_at hebben.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, income_type, record_date, nomenclature_code
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.income_records
)
DELETE FROM public.income_records r
USING ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS income_records_uniq_per_code
  ON public.income_records (user_id, income_type, record_date, nomenclature_code);