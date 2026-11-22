CREATE TABLE IF NOT EXISTS public.claswee_image_import_ocr (
  upload_id text PRIMARY KEY,
  client_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claswee_image_import_ocr_created_idx
  ON public.claswee_image_import_ocr (created_at);

ALTER TABLE public.claswee_image_import_ocr ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claswee_image_import_ocr TO anon;

CREATE POLICY claswee_image_import_ocr_service_only
  ON public.claswee_image_import_ocr
  FOR ALL TO anon
  USING (claswee_is_service_request())
  WITH CHECK (claswee_is_service_request());
