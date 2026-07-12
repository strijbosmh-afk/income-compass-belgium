DROP POLICY IF EXISTS "Authenticated users can read price snapshots" ON public.portfolio_price_snapshots;

CREATE POLICY "Users can read price snapshots for their portfolio symbols"
  ON public.portfolio_price_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_assets pa
      WHERE pa.user_id = auth.uid()
        AND upper(pa.symbol) = upper(portfolio_price_snapshots.symbol)
    )
  );