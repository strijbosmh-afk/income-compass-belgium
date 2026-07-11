
CREATE TABLE IF NOT EXISTS public.portfolio_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  resolved_symbol text,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  price numeric NOT NULL,
  currency text,
  price_eur numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portfolio_price_snapshots_symbol_at_idx
  ON public.portfolio_price_snapshots (symbol, snapshot_at DESC);

GRANT SELECT ON public.portfolio_price_snapshots TO authenticated;
GRANT ALL ON public.portfolio_price_snapshots TO service_role;

ALTER TABLE public.portfolio_price_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read price snapshots" ON public.portfolio_price_snapshots;
CREATE POLICY "Authenticated users can read price snapshots"
  ON public.portfolio_price_snapshots
  FOR SELECT
  TO authenticated
  USING (true);
