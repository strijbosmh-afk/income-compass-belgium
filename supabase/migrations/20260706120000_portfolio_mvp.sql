CREATE TABLE public.portfolio_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  isin TEXT,
  name TEXT NOT NULL DEFAULT '',
  asset_class TEXT NOT NULL DEFAULT 'equity_etf',
  region TEXT NOT NULL DEFAULT 'global',
  sector TEXT NOT NULL DEFAULT 'broad',
  currency TEXT NOT NULL DEFAULT 'EUR',
  broker TEXT NOT NULL DEFAULT '',
  current_price NUMERIC NOT NULL DEFAULT 0,
  target_weight NUMERIC NOT NULL DEFAULT 0,
  expense_ratio NUMERIC NOT NULL DEFAULT 0,
  tax_profile TEXT NOT NULL DEFAULT 'etf_standard',
  is_accumulating BOOLEAN NOT NULL DEFAULT true,
  is_ucits BOOLEAN NOT NULL DEFAULT true,
  has_bond_component BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
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

CREATE UNIQUE INDEX idx_portfolio_assets_user_symbol_broker
  ON public.portfolio_assets(user_id, lower(symbol), lower(broker));

CREATE TABLE public.portfolio_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_id UUID REFERENCES public.portfolio_assets(id) ON DELETE SET NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('buy', 'sell', 'dividend', 'deposit', 'withdrawal', 'fee', 'tax')),
  symbol TEXT NOT NULL DEFAULT '',
  quantity NUMERIC NOT NULL DEFAULT 0,
  price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  fees NUMERIC NOT NULL DEFAULT 0,
  taxes NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  broker TEXT NOT NULL DEFAULT '',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolio_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own portfolio transactions" ON public.portfolio_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own portfolio transactions" ON public.portfolio_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolio transactions" ON public.portfolio_transactions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolio transactions" ON public.portfolio_transactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_portfolio_transactions_updated_at
  BEFORE UPDATE ON public.portfolio_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_portfolio_transactions_user_date
  ON public.portfolio_transactions(user_id, transaction_date DESC);
CREATE INDEX idx_portfolio_transactions_user_asset
  ON public.portfolio_transactions(user_id, asset_id);
