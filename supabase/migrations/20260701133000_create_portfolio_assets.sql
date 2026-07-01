CREATE TABLE public.portfolio_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol text NOT NULL,
  name text NOT NULL DEFAULT '',
  asset_type text NOT NULL DEFAULT 'stock' CHECK (asset_type IN ('stock', 'etf', 'fund', 'bond', 'crypto', 'other')),
  exchange text,
  mic text,
  currency text NOT NULL DEFAULT 'EUR',
  purchase_date date NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  purchase_price numeric NOT NULL CHECK (purchase_price >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own portfolio assets" ON public.portfolio_assets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own portfolio assets" ON public.portfolio_assets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolio assets" ON public.portfolio_assets
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolio assets" ON public.portfolio_assets
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_portfolio_assets_updated_at
  BEFORE UPDATE ON public.portfolio_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_portfolio_assets_user_symbol ON public.portfolio_assets(user_id, symbol);
CREATE INDEX idx_portfolio_assets_user_purchase_date ON public.portfolio_assets(user_id, purchase_date);
