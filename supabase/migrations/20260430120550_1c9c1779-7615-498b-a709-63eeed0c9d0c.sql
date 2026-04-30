
CREATE TABLE public.month_closures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  closed_at timestamp with time zone NOT NULL DEFAULT now(),
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, year, month)
);

ALTER TABLE public.month_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own closures" ON public.month_closures
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own closures" ON public.month_closures
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own closures" ON public.month_closures
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own closures" ON public.month_closures
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_month_closures_updated_at
  BEFORE UPDATE ON public.month_closures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
