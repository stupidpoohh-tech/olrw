-- ═══════════════════════════════════════════════════════════════════════════
-- Neon 환경 스텁 — 로컬 Postgres에서 마이그레이션을 검증하기 위한 최소 구성
--
-- Neon 프로젝트 없이 RLS·서버 함수의 동작을 확인한다. 실제 Neon에 적용하지
-- 않는다 (auth 스키마는 pg_session_jwt 가 이미 만들어 둔다).
--
-- neon_auth 는 스텁하지 않는다. 스키마가 그쪽을 전혀 참조하지 않기 때문이다 —
-- 외래키도 트리거도 없다. 앱이 로그인 직후 ensure_profile() 을 부르는 것이
-- 유일한 연결점이고, seed_user() 가 그 경로를 그대로 밟는다.
--
--   docker 없이:  neon/tests/run.sh
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin create role anonymous     nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;

grant usage on schema public to anonymous, authenticated;
alter default privileges in schema public grant select on tables to anonymous, authenticated;
alter default privileges in schema public grant insert, update, delete on tables to anonymous, authenticated;

-- ── auth (pg_session_jwt 가 하는 일) ──────────────────────────────────────
create schema auth;
grant usage on schema auth to anonymous, authenticated;

-- PostgREST 모드에서 pg_session_jwt 는 request.jwt.claims 의 sub 를 읽는다.
-- 실물과 같은 이름·같은 반환형으로 둔다.
create or replace function auth.user_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$ select auth.user_id()::uuid $$;

-- ── 테스트 헬퍼 ───────────────────────────────────────────────────────────
-- 로그인한 사용자를 흉내낸다. Data API 가 JWT 에서 세우는 설정과 같은 이름.
create or replace function as_user(u text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u)::text, false);
  perform set_config('request.jwt.claim.sub', u, false);
end $$;

-- 가입 직후의 앱을 흉내낸다. Neon Auth 가 사용자를 만들고, 앱이 곧바로
-- ensure_profile() 을 한 번 부른다. 여기서 재현하는 것은 뒤쪽 절반이다.
create or replace function seed_user(p_id uuid, p_name text) returns void
language plpgsql as $$
begin
  perform as_user(p_id::text);
  perform ensure_profile(p_name);
end $$;
