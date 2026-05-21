ALTER TABLE public.pension_ipt_records
  ADD COLUMN IF NOT EXISTS beginkapitaal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eindkapitaal numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inkomende_bewegingen numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS uitgaande_bewegingen numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kosten_taksen numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kosten_overlijden numeric NOT NULL DEFAULT 0;