ALTER TABLE public.portfolio_assets
  DROP CONSTRAINT IF EXISTS portfolio_assets_quantity_check;

ALTER TABLE public.portfolio_assets
  ADD CONSTRAINT portfolio_assets_quantity_check
  CHECK (
    quantity > 0
    OR (
      quantity < 0
      AND asset_type = 'other'
      AND (
        upper(symbol) LIKE 'CASH-%'
        OR lower(name) LIKE '%cash%'
        OR lower(coalesce(notes, '')) LIKE '%debet%'
      )
    )
  );
