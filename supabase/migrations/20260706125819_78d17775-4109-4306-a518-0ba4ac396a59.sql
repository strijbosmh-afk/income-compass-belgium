
ALTER TABLE public.pension_ipt_records ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE public.vapz_records ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE public.vapz_riziv_records ADD COLUMN IF NOT EXISTS file_hash TEXT;
ALTER TABLE public.pensioensparen_records ADD COLUMN IF NOT EXISTS file_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS pension_ipt_user_hash_uniq ON public.pension_ipt_records(user_id, file_hash) WHERE file_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vapz_user_hash_uniq ON public.vapz_records(user_id, file_hash) WHERE file_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vapz_riziv_user_hash_uniq ON public.vapz_riziv_records(user_id, file_hash) WHERE file_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pensioensparen_user_hash_uniq ON public.pensioensparen_records(user_id, file_hash) WHERE file_hash IS NOT NULL;
