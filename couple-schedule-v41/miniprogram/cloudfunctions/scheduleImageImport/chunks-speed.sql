-- Existing environments: allow 80,000-character chunks after the 100KB
-- gateway boundary has been accounted for in the mini program request body.
ALTER TABLE public.claswee_image_import_chunks
  DROP CONSTRAINT IF EXISTS claswee_image_import_chunks_content_check;
ALTER TABLE public.claswee_image_import_chunks
  ADD CONSTRAINT claswee_image_import_chunks_content_check
  CHECK (char_length(content) <= 80000);
