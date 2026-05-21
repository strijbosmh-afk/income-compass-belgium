
CREATE TABLE public.pension_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  year INTEGER NOT NULL,
  pensioenreserve NUMERIC NOT NULL DEFAULT 0,
  overlijdensdekking NUMERIC NOT NULL DEFAULT 0,
  pensioenreserve_vapz NUMERIC NOT NULL DEFAULT 0,
  vap_riziv_toelage NUMERIC NOT NULL DEFAULT 0,
  source_pdf_url TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pension_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own pension records" ON public.pension_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pension records" ON public.pension_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pension records" ON public.pension_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pension records" ON public.pension_records FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_pension_records_updated_at
BEFORE UPDATE ON public.pension_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pension_records_user_date ON public.pension_records(user_id, snapshot_date DESC);

INSERT INTO storage.buckets (id, name, public) VALUES ('pension-pdfs', 'pension-pdfs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can view own pension pdfs" ON storage.objects FOR SELECT
  USING (bucket_id = 'pension-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can upload own pension pdfs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pension-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own pension pdfs" ON storage.objects FOR UPDATE
  USING (bucket_id = 'pension-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own pension pdfs" ON storage.objects FOR DELETE
  USING (bucket_id = 'pension-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
