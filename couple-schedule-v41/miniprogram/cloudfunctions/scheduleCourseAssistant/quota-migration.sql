BEGIN;
CREATE TABLE IF NOT EXISTS public.claswee_course_ai_quota (
 actor TEXT PRIMARY KEY, day DATE NOT NULL, count INTEGER NOT NULL DEFAULT 0 CHECK(count>=0),
 last_at TIMESTAMPTZ, busy_until TIMESTAMPTZ, active_request TEXT
);
ALTER TABLE public.claswee_course_ai_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.claswee_course_ai_quota FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.claswee_course_ai_quota TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.claswee_course_ai_quota TO anon;
DROP POLICY IF EXISTS claswee_service_only ON public.claswee_course_ai_quota;
CREATE POLICY claswee_service_only ON public.claswee_course_ai_quota FOR ALL TO anon
 USING(public.claswee_is_service_request()) WITH CHECK(public.claswee_is_service_request());

CREATE OR REPLACE FUNCTION public.claswee_course_ai_take_quota(p_actor TEXT,p_request TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
 today DATE := (now() AT TIME ZONE 'Asia/Shanghai')::date;
 user_row public.claswee_course_ai_quota%ROWTYPE;
 global_row public.claswee_course_ai_quota%ROWTYPE;
BEGIN
 IF NOT public.claswee_is_service_request() THEN RAISE EXCEPTION 'unauthorized'; END IF;
 IF p_actor IS NULL OR p_request IS NULL OR p_actor !~ '^[a-f0-9]{64}$' OR p_request !~ '^[a-f0-9]{32}$' THEN RAISE EXCEPTION 'invalid input'; END IF;
 INSERT INTO public.claswee_course_ai_quota(actor,day) VALUES('global',today) ON CONFLICT DO NOTHING;
 SELECT * INTO global_row FROM public.claswee_course_ai_quota WHERE actor='global' FOR UPDATE;
 INSERT INTO public.claswee_course_ai_quota(actor,day) VALUES(p_actor,today) ON CONFLICT DO NOTHING;
 SELECT * INTO user_row FROM public.claswee_course_ai_quota WHERE actor=p_actor FOR UPDATE;
 IF user_row.busy_until>now() THEN RETURN jsonb_build_object('ok',false,'code','BUSY'); END IF;
 IF user_row.last_at>now()-interval '3 seconds' THEN RETURN jsonb_build_object('ok',false,'code','TOO_FAST'); END IF;
 IF user_row.day=today AND user_row.count>=20 THEN RETURN jsonb_build_object('ok',false,'code','DAILY_LIMIT'); END IF;
 IF global_row.day=today AND global_row.count>=500 THEN RETURN jsonb_build_object('ok',false,'code','GLOBAL_LIMIT'); END IF;
 UPDATE public.claswee_course_ai_quota SET day=today,count=CASE WHEN day=today THEN count+1 ELSE 1 END,last_at=now(),busy_until=now()+interval '70 seconds',active_request=p_request WHERE actor=p_actor;
 UPDATE public.claswee_course_ai_quota SET day=today,count=CASE WHEN day=today THEN count+1 ELSE 1 END,last_at=now() WHERE actor='global';
 RETURN jsonb_build_object('ok',true,'remaining',19-CASE WHEN user_row.day=today THEN user_row.count ELSE 0 END);
END;
$$;
CREATE OR REPLACE FUNCTION public.claswee_course_ai_release_quota(p_actor TEXT,p_request TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.claswee_is_service_request() THEN RAISE EXCEPTION 'unauthorized'; END IF;
 UPDATE public.claswee_course_ai_quota SET busy_until=NULL,active_request=NULL WHERE actor=p_actor AND active_request=p_request;
 RETURN jsonb_build_object('ok',true);
END;
$$;
REVOKE ALL ON FUNCTION public.claswee_course_ai_take_quota(TEXT,TEXT) FROM PUBLIC,authenticated;
REVOKE ALL ON FUNCTION public.claswee_course_ai_release_quota(TEXT,TEXT) FROM PUBLIC,authenticated;
GRANT EXECUTE ON FUNCTION public.claswee_course_ai_take_quota(TEXT,TEXT) TO anon,service_role;
GRANT EXECUTE ON FUNCTION public.claswee_course_ai_release_quota(TEXT,TEXT) TO anon,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
