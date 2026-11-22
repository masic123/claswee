-- Keep all existing token hashes and expiry times. Rejoining may add a valid
-- credential without revoking another instance using the same client identity.
BEGIN;
ALTER TABLE public.claswee_room_sessions
  DROP CONSTRAINT IF EXISTS claswee_room_sessions_room_code_client_hash_key;
CREATE INDEX IF NOT EXISTS claswee_room_sessions_client_idx
  ON public.claswee_room_sessions(room_code,client_hash);
COMMIT;
