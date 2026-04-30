ALTER TABLE public.income_goals DROP CONSTRAINT IF EXISTS income_goals_period_type_check;
ALTER TABLE public.income_goals ADD CONSTRAINT income_goals_period_type_check
  CHECK (period_type IN ('year', 'quarter', 'month', 'custom'));