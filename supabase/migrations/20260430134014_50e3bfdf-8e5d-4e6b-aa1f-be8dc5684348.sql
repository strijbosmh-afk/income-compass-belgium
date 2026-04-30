ALTER TABLE public.income_goals 
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_start integer,
  ADD COLUMN IF NOT EXISTS period_end integer;

-- Initialiseer sort_order per gebruiker op basis van bestaande volgorde
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY year, period_type, period_value, created_at) - 1 AS rn
  FROM public.income_goals
)
UPDATE public.income_goals g SET sort_order = r.rn FROM ranked r WHERE r.id = g.id AND g.sort_order = 0;