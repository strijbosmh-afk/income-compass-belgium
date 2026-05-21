CREATE TABLE public.pension_ipt_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  year integer NOT NULL,
  opgebouwde_reserve numeric NOT NULL DEFAULT 0,
  jaarpremie numeric NOT NULL DEFAULT 0,
  overlijdenskapitaal numeric NOT NULL DEFAULT 0,
  gewaarborgd_rendement numeric NOT NULL DEFAULT 0,
  source_pdf_url text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pension_ipt_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ipt records" ON public.pension_ipt_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ipt records" ON public.pension_ipt_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ipt records" ON public.pension_ipt_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own ipt records" ON public.pension_ipt_records FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_pension_ipt_updated_at
  BEFORE UPDATE ON public.pension_ipt_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('pension-ipt-pdfs', 'pension-ipt-pdfs', false);

CREATE POLICY "Users can view own ipt pdfs" ON storage.objects FOR SELECT
  USING (bucket_id = 'pension-ipt-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can upload own ipt pdfs" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'pension-ipt-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own ipt pdfs" ON storage.objects FOR DELETE
  USING (bucket_id = 'pension-ipt-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);