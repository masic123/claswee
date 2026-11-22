BEGIN;
CREATE TABLE IF NOT EXISTS public.claswee_room_messages (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  room_code TEXT NOT NULL REFERENCES public.claswee_rooms(room_code) ON DELETE CASCADE,
  sender_client TEXT NOT NULL,
  sender_owner TEXT NOT NULL CHECK (sender_owner IN ('cat','dog')),
  recipient_owner TEXT NOT NULL CHECK (recipient_owner IN ('cat','dog') AND recipient_owner <> sender_owner),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS claswee_messages_unread_idx ON public.claswee_room_messages(room_code,recipient_owner,created_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS claswee_messages_sender_idx ON public.claswee_room_messages(room_code,sender_client,created_at);
ALTER TABLE public.claswee_room_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.claswee_room_messages FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.claswee_room_messages TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.claswee_room_messages TO anon;
DROP POLICY IF EXISTS claswee_service_only ON public.claswee_room_messages;
CREATE POLICY claswee_service_only ON public.claswee_room_messages FOR ALL TO anon
  USING(public.claswee_is_service_request()) WITH CHECK(public.claswee_is_service_request());
COMMIT;
