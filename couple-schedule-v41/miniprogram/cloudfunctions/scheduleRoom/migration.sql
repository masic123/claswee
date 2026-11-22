BEGIN;

CREATE TABLE IF NOT EXISTS public.claswee_rooms (
  room_code TEXT PRIMARY KEY,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  schedule_data JSONB NOT NULL,
  data_updated_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  member_count INTEGER NOT NULL DEFAULT 0,
  claimed_from_legacy BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT claswee_rooms_room_code_length CHECK (char_length(room_code) BETWEEN 1 AND 64)
);

CREATE TABLE IF NOT EXISTS public.claswee_room_sessions (
  token_hash TEXT PRIMARY KEY,
  room_code TEXT NOT NULL REFERENCES public.claswee_rooms(room_code) ON DELETE CASCADE,
  client_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS public.claswee_room_members (
  room_code TEXT NOT NULL REFERENCES public.claswee_rooms(room_code) ON DELETE CASCADE,
  client_hash TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, client_hash)
);

CREATE TABLE IF NOT EXISTS public.claswee_room_attempts (
  room_code TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  lock_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_code, client_hash)
);

CREATE TABLE IF NOT EXISTS public.claswee_service_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  key_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claswee_room_sessions_expiry_idx ON public.claswee_room_sessions(expires_at);
CREATE INDEX IF NOT EXISTS claswee_room_sessions_room_idx ON public.claswee_room_sessions(room_code);
CREATE INDEX IF NOT EXISTS claswee_room_sessions_client_idx ON public.claswee_room_sessions(room_code,client_hash);
CREATE INDEX IF NOT EXISTS claswee_room_members_room_idx ON public.claswee_room_members(room_code);
CREATE INDEX IF NOT EXISTS claswee_room_attempts_updated_idx ON public.claswee_room_attempts(updated_at);

ALTER TABLE public.claswee_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claswee_room_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claswee_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claswee_room_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.claswee_rooms FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.claswee_room_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.claswee_room_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.claswee_room_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.claswee_service_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.claswee_rooms TO service_role;
GRANT ALL ON public.claswee_room_sessions TO service_role;
GRANT ALL ON public.claswee_room_members TO service_role;
GRANT ALL ON public.claswee_room_attempts TO service_role;
GRANT ALL ON public.claswee_service_config TO service_role;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION public.claswee_is_service_request()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  raw_headers TEXT;
  supplied TEXT;
  expected TEXT;
BEGIN
  raw_headers := current_setting('request.headers', true);
  IF raw_headers IS NULL OR raw_headers = '' THEN RETURN false; END IF;
  supplied := COALESCE((raw_headers::jsonb ->> 'x-claswee-service-key'), '');
  SELECT key_hash INTO expected FROM public.claswee_service_config WHERE singleton = true;
  RETURN expected IS NOT NULL AND encode(digest(supplied, 'sha256'), 'hex') = expected;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.claswee_is_service_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claswee_is_service_request() TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claswee_rooms TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claswee_room_sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claswee_room_members TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claswee_room_attempts TO anon;

DROP POLICY IF EXISTS claswee_service_only ON public.claswee_rooms;
CREATE POLICY claswee_service_only ON public.claswee_rooms FOR ALL TO anon
  USING (public.claswee_is_service_request()) WITH CHECK (public.claswee_is_service_request());
DROP POLICY IF EXISTS claswee_service_only ON public.claswee_room_sessions;
CREATE POLICY claswee_service_only ON public.claswee_room_sessions FOR ALL TO anon
  USING (public.claswee_is_service_request()) WITH CHECK (public.claswee_is_service_request());
DROP POLICY IF EXISTS claswee_service_only ON public.claswee_room_members;
CREATE POLICY claswee_service_only ON public.claswee_room_members FOR ALL TO anon
  USING (public.claswee_is_service_request()) WITH CHECK (public.claswee_is_service_request());
DROP POLICY IF EXISTS claswee_service_only ON public.claswee_room_attempts;
CREATE POLICY claswee_service_only ON public.claswee_room_attempts FOR ALL TO anon
  USING (public.claswee_is_service_request()) WITH CHECK (public.claswee_is_service_request());

COMMIT;
