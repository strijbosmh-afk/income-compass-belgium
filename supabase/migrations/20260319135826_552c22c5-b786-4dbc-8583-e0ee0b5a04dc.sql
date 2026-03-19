ALTER TABLE public.income_records 
  ADD COLUMN aandeel_arts numeric NOT NULL DEFAULT 0,
  ADD COLUMN bouwfonds numeric NOT NULL DEFAULT 0,
  ADD COLUMN mif numeric NOT NULL DEFAULT 0;