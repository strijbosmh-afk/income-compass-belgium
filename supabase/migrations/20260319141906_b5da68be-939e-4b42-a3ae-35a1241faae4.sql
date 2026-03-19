ALTER TABLE public.income_records ADD COLUMN netto numeric NOT NULL DEFAULT 0;
UPDATE public.income_records SET netto = total_amount - bouwfonds - mif;