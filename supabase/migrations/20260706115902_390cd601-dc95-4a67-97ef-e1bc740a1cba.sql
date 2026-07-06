-- Drop oude VAPZ tabel + alle data
DROP TABLE IF EXISTS public.pension_records CASCADE;

-- ============ VAPZ ============
CREATE TABLE public.vapz_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  year integer NOT NULL,
  pensioenreserve numeric NOT NULL DEFAULT 0,
  overlijdensdekking numeric NOT NULL DEFAULT 0,
  jaarpremie numeric NOT NULL DEFAULT 0,
  source_pdf_url text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vapz_records TO authenticated;
GRANT ALL ON public.vapz_records TO service_role;
ALTER TABLE public.vapz_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vapz select own" ON public.vapz_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vapz insert own" ON public.vapz_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vapz update own" ON public.vapz_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "vapz delete own" ON public.vapz_records FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_vapz_user_date ON public.vapz_records(user_id, snapshot_date DESC);
CREATE TRIGGER update_vapz_updated_at BEFORE UPDATE ON public.vapz_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ VAPZ RIZIV ============
CREATE TABLE public.vapz_riziv_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  year integer NOT NULL,
  pensioenreserve numeric NOT NULL DEFAULT 0,
  overlijdensdekking numeric NOT NULL DEFAULT 0,
  jaarpremie numeric NOT NULL DEFAULT 0,
  source_pdf_url text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vapz_riziv_records TO authenticated;
GRANT ALL ON public.vapz_riziv_records TO service_role;
ALTER TABLE public.vapz_riziv_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vapz_riziv select own" ON public.vapz_riziv_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vapz_riziv insert own" ON public.vapz_riziv_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vapz_riziv update own" ON public.vapz_riziv_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "vapz_riziv delete own" ON public.vapz_riziv_records FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_vapz_riziv_user_date ON public.vapz_riziv_records(user_id, snapshot_date DESC);
CREATE TRIGGER update_vapz_riziv_updated_at BEFORE UPDATE ON public.vapz_riziv_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Pensioensparen ============
CREATE TABLE public.pensioensparen_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  year integer NOT NULL,
  pensioenreserve numeric NOT NULL DEFAULT 0,
  overlijdensdekking numeric NOT NULL DEFAULT 0,
  jaarpremie numeric NOT NULL DEFAULT 0,
  source_pdf_url text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pensioensparen_records TO authenticated;
GRANT ALL ON public.pensioensparen_records TO service_role;
ALTER TABLE public.pensioensparen_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pensioensparen select own" ON public.pensioensparen_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pensioensparen insert own" ON public.pensioensparen_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pensioensparen update own" ON public.pensioensparen_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "pensioensparen delete own" ON public.pensioensparen_records FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_pensioensparen_user_date ON public.pensioensparen_records(user_id, snapshot_date DESC);
CREATE TRIGGER update_pensioensparen_updated_at BEFORE UPDATE ON public.pensioensparen_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();