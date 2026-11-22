CREATE TABLE IF NOT EXISTS public.claswee_image_import_chunks (
  upload_id text NOT NULL,
  client_hash text NOT NULL,
  part_index integer NOT NULL CHECK (part_index >= 0 AND part_index < 72),
  part_count integer NOT NULL CHECK (part_count > 0 AND part_count <= 72),
  mime text NOT NULL CHECK (mime IN ('jpeg', 'png', 'webp')),
  content text NOT NULL CHECK (char_length(content) <= 80000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (upload_id, part_index)
);

CREATE INDEX IF NOT EXISTS claswee_image_import_chunks_created_idx
  ON public.claswee_image_import_chunks (created_at);

ALTER TABLE public.claswee_image_import_chunks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claswee_image_import_chunks TO anon;

CREATE POLICY claswee_image_import_service_only
  ON public.claswee_image_import_chunks
  FOR ALL TO anon
  USING (claswee_is_service_request())
  WITH CHECK (claswee_is_service_request());
