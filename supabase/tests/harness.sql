-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase 환경 스텁 — 로컬 Postgres에서 마이그레이션을 검증하기 위한 최소 구성
--
-- Supabase 프로젝트 없이 RLS·서버 함수의 동작을 확인한다. 실제 Supabase에
-- 적용하지 않는다 (auth / storage 스키마는 이미 존재한다).
--
--   docker 없이:  supabase/tests/run.sh
-- ═══════════════════════════════════════════════════════════════════════════

do $$ begin create role anon          nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role  nologin; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant insert, update, delete on tables to anon, authenticated;

-- ── auth ──────────────────────────────────────────────────────────────────
create schema auth;
grant usage on schema auth to anon, authenticated;   -- Supabase 실제 환경과 동일

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- ── storage ───────────────────────────────────────────────────────────────
create schema storage;
grant usage on schema storage to anon, authenticated;

create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;

-- ── 테스트 헬퍼 ───────────────────────────────────────────────────────────
-- 로그인한 사용자를 흉내낸다. PostgREST가 JWT에서 세우는 설정과 같은 이름.
create or replace function as_user(u text) returns void
language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;
