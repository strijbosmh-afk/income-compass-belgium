
-- Create update timestamp function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Nomenclature codes table (RIZIV)
CREATE TABLE public.nomenclature_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, code)
);

ALTER TABLE public.nomenclature_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own nomenclature" ON public.nomenclature_codes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own nomenclature" ON public.nomenclature_codes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own nomenclature" ON public.nomenclature_codes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own nomenclature" ON public.nomenclature_codes FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_nomenclature_updated_at BEFORE UPDATE ON public.nomenclature_codes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Income records table
CREATE TABLE public.income_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  record_date DATE NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  income_type TEXT NOT NULL CHECK (income_type IN ('ambulatory', 'hospitalized')),
  nomenclature_code TEXT NOT NULL,
  description TEXT DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  source_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.income_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own records" ON public.income_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own records" ON public.income_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own records" ON public.income_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own records" ON public.income_records FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_income_records_updated_at BEFORE UPDATE ON public.income_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_income_records_user_date ON public.income_records(user_id, year, month);
CREATE INDEX idx_income_records_type ON public.income_records(user_id, income_type);

-- Storage bucket for uploaded screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('screenshots', 'screenshots', false);

CREATE POLICY "Users can upload screenshots" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own screenshots" ON storage.objects FOR SELECT USING (bucket_id = 'screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
