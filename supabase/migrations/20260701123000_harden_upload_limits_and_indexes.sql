UPDATE storage.buckets
SET
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp']
WHERE id = 'screenshots';

UPDATE storage.buckets
SET
  file_size_limit = 12582912,
  allowed_mime_types = ARRAY['application/pdf']
WHERE id IN ('pension-pdfs', 'pension-ipt-pdfs');

CREATE INDEX IF NOT EXISTS idx_pension_ipt_records_user_date
ON public.pension_ipt_records(user_id, snapshot_date DESC);
