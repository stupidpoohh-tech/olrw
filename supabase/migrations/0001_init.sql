-- ═══════════════════════════════════════════════════════════════════════════
-- OLRW — 초기 스키마 · RLS · 서버 함수
--
-- 설계 근거: docs/PORTING-SPEC.md §7 (정본)
-- 결정 사항: docs/decisions.md D1–D8
-- 진단 대응: docs/AUDIT.md §04 S1–S11
--
-- 핵심 원칙
--   1. 제본은 스냅샷이다. 이름·용지색을 그 시점 값으로 복사한다.
--   2. 쓰기 경로 중 생성·참여·제본·탈퇴는 RLS가 아니라 security definer 함수로 닫는다.
--      테이블 직접 INSERT는 telegrams 하나뿐이다.
--   3. 소프트 삭제. deleted_at을 실제로 쓰고 모든 조회에서 제외한다.
--   4. 정원 4명. 의도적 상한 — 올리지 않는다.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────────────────────
-- 내부 호출 표식
--   security definer 함수도 트리거를 통과한다. 불변 컬럼 잠금 트리거가
--   함수의 정당한 쓰기까지 막지 않도록, 함수 안에서만 이 플래그를 세운다.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function is_internal() returns boolean
language sql stable as $$
  select coalesce(current_setting('olrw.internal', true), 'off') = 'on';
$$;

-- ═══ 테이블 ════════════════════════════════════════════════════════════════

create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 12),
  created_at   timestamptz not null default now()
);

-- 가입과 동시에 프로필을 만든다. 클라이언트가 만들면 "프로필 없는 사용자"가 생긴다.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), '이름 없음'), 12)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── boxes ─────────────────────────────────────────────────────────────────
-- S1: 초대 코드는 앱이 쓰는 ABCD-2345 형식이다. 혼동 문자(I O 0 1)를 뺀 32자 알파벳.
--     기존 초안의 ^[A-Z0-9]{6}$ 는 앱이 만드는 코드를 전부 거부해 전보함이
--     하나도 생성되지 않았다.
create table boxes (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null default '이름 없는 전보함'
                       check (char_length(name) between 1 and 20),
  invite_code        text not null unique
                       check (invite_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$'),
  owner_id           uuid not null references profiles(id) on delete restrict,
  current_vol        int  not null default 1 check (current_vol >= 1),

  -- D1 봉인 모드. true면 남이 보낸 이번 권 전보는 봉투로만 보인다.
  sealed             boolean not null default true,

  -- D1/D2 봉인 해제 시각. 만남 마감의 '함께 읽기'를 시작하면 세워진다.
  -- 한 번 열린 권은 다시 봉인되지 않는다 — 의식을 중간에 취소해도 마찬가지다.
  -- close_volume()이 다음 권을 열 때 null로 되돌린다.
  reading_started_at timestamptz,

  created_at         timestamptz not null default now()
);

-- ── box_members ───────────────────────────────────────────────────────────
-- paper_color: 공개(발신인 구분) / type_color: 개인 설정(본인만 봄)
-- 컬럼 이름은 type_color 그대로 둔다. 값은 타자기 id 다 — 이름만 바꾸면 스키마가
-- 흔들리고 얻는 게 없다.
create table box_members (
  box_id      uuid not null references boxes(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  paper_color text not null check (paper_color in
    ('ivory','blush','sage','powder','lilac','wheat','clay','mist')),
  -- 타자기. 색이 아니라 물건이다 — 네 대가 생김새도 소리도 다르다. (docs/decisions.md D9)
  type_color  text not null check (type_color in ('steel','oak','sugar','moss')),
  joined_at   timestamptz not null default now(),
  primary key (box_id, user_id),

  -- 색은 정보다. 한 전보함에서 용지색이 겹치면 발신인을 색으로 읽을 수 없다.
  -- 8색 중 4명이므로 언제나 남는 색이 있다.
  unique (box_id, paper_color)
);
create index box_members_user on box_members (user_id);

-- 정원 4명. 의도적 상한 — 올리지 않는다.
create or replace function enforce_box_capacity() returns trigger
language plpgsql as $$
begin
  if (select count(*) from box_members where box_id = new.box_id) >= 4 then
    raise exception '전보함 정원이 찼습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger box_capacity before insert on box_members
  for each row execute function enforce_box_capacity();

-- ── telegrams ─────────────────────────────────────────────────────────────
-- S6: 본문 상한은 앱의 CHAR_LIMIT과 같은 100자다. 초안의 2000은 20배 느슨했다.
create table telegrams (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid not null references boxes(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete restrict,
  body       text not null check (char_length(body) between 1 and 100),
  vol        int  not null check (vol >= 1),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index telegrams_box_vol on telegrams (box_id, vol, created_at desc)
  where deleted_at is null;

-- ── volumes ───────────────────────────────────────────────────────────────
-- S7: 색 id와 사진 URL을 한 컬럼에 섞지 않는다. 종류와 값을 나눈다.
create table volumes (
  id           uuid primary key default gen_random_uuid(),
  box_id       uuid not null references boxes(id) on delete cascade,
  vol          int  not null,
  title        text not null default '' check (char_length(title) <= 20),

  cover_kind   text not null default 'color' check (cover_kind in ('color','photo')),
  cover_value  text not null default 'sage',
  -- cover_kind='color' → 표지색 id / 'photo' → Storage 경로. base64 금지.
  constraint cover_value_valid check (
    (cover_kind = 'color' and cover_value in ('sage','burgundy','sand','navy','charcoal'))
    or (cover_kind = 'photo' and cover_value <> '')
  ),

  period_start timestamptz not null,
  period_end   timestamptz not null,
  page_count   int  not null default 0 check (page_count >= 0),

  -- D2: 함께 읽기를 건너뛰지 않고 끝까지 넘겼는지. 권 안쪽에 남는 기록.
  read_together boolean not null default false,

  -- D3 미채택이지만 문은 남긴다. 지금은 closed_at과 같은 값이 들어간다.
  met_at       timestamptz not null default now(),
  closed_at    timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (box_id, vol)
);
create index volumes_box on volumes (box_id, vol desc) where deleted_at is null;

-- ── volume_pages ──────────────────────────────────────────────────────────
-- 제본 시점 스냅샷. author_name / paper_color 를 그때 값으로 복사한다.
-- 이후 이름·색이 바뀌어도 과거 책은 변하지 않는다.
create table volume_pages (
  volume_id   uuid not null references volumes(id) on delete cascade,
  ord         int  not null,
  author_id   uuid references profiles(id) on delete set null,
  author_name text not null,
  paper_color text not null,
  body        text not null,
  sent_at     timestamptz not null,
  primary key (volume_id, ord)
);

-- ═══ 불변 컬럼 잠금 ════════════════════════════════════════════════════════
-- S5: with check 없는 update 정책은 "행을 수정할 권한"을 "행을 무엇으로든
--     바꿀 권한"으로 만든다. 소유자 이전, 초대코드 변조, 전보를 다른 방으로
--     옮기기가 전부 가능했다. 정책 대신 트리거로 컬럼 단위로 잠근다.

create or replace function boxes_guard() returns trigger
language plpgsql as $$
begin
  if is_internal() then return new; end if;
  if new.id <> old.id
     or new.invite_code <> old.invite_code
     or new.owner_id <> old.owner_id
     or new.current_vol <> old.current_vol
     or new.created_at <> old.created_at
     or new.reading_started_at is distinct from old.reading_started_at then
    raise exception '이 항목은 직접 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger boxes_guard_t before update on boxes
  for each row execute function boxes_guard();

create or replace function members_guard() returns trigger
language plpgsql as $$
begin
  if is_internal() then return new; end if;
  if new.box_id <> old.box_id or new.user_id <> old.user_id
     or new.joined_at <> old.joined_at then
    raise exception '이 항목은 직접 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger members_guard_t before update on box_members
  for each row execute function members_guard();

-- 전보는 발신하면 끝이다. 사용자가 바꿀 수 있는 것은 deleted_at 하나뿐이고,
-- 그것도 되돌릴 수 없다(S9: 소프트 삭제를 실제로 쓴다).
create or replace function telegrams_guard() returns trigger
language plpgsql as $$
begin
  if is_internal() then return new; end if;
  if new.id <> old.id or new.box_id <> old.box_id or new.author_id <> old.author_id
     or new.body <> old.body or new.vol <> old.vol or new.created_at <> old.created_at then
    raise exception '전보는 수정할 수 없습니다.' using errcode = 'P0001';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception '삭제한 전보는 되돌릴 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger telegrams_guard_t before update on telegrams
  for each row execute function telegrams_guard();

-- ═══ 멤버십 헬퍼 ═══════════════════════════════════════════════════════════
-- security definer라 함수 안에서는 RLS를 타지 않는다. 정책이 자기 테이블을
-- 다시 조회해 무한 재귀에 빠지는 것을 막는 표준 수법이다.

create or replace function is_member(b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from box_members where box_id = b and user_id = auth.uid());
$$;

create or replace function is_owner(b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from boxes where id = b and owner_id = auth.uid());
$$;

-- D1: 이 전보를 전문으로 볼 수 있는가.
--   내가 쓴 것 / 열린함 / 이미 제본된 권 / 이번 권의 봉인이 풀린 상태
create or replace function can_read_body(p_box_id uuid, p_author_id uuid, p_vol int)
returns boolean
language sql security definer stable set search_path = public as $$
  select p_author_id = auth.uid()
      or exists (
        select 1 from boxes b
        where b.id = p_box_id
          and (b.sealed = false
            or p_vol < b.current_vol
            or b.reading_started_at is not null)
      );
$$;

-- ═══ RLS ═══════════════════════════════════════════════════════════════════

alter table profiles     enable row level security;
alter table boxes        enable row level security;
alter table box_members  enable row level security;
alter table telegrams    enable row level security;
alter table volumes      enable row level security;
alter table volume_pages enable row level security;

-- profiles: 본인 + 같은 전보함 멤버
create policy profiles_read on profiles for select using (
  id = auth.uid() or exists (
    select 1 from box_members m1
    join box_members m2 on m1.box_id = m2.box_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  )
);
create policy profiles_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
-- insert 없음: 프로필은 가입 트리거만 만든다.

-- boxes: 멤버만 읽는다. 생성·참여는 함수로만. 이름만 멤버가 바꿀 수 있다.
-- S4: 초안은 insert 직후 select 정책이 막아 INSERT ... RETURNING 자체가 실패했다.
--     생성을 함수로 옮겨 문제가 사라졌다.
create policy boxes_read   on boxes for select using (is_member(id));
create policy boxes_update on boxes for update
  using (is_member(id)) with check (is_member(id));

-- box_members: S2 — 초안의 with check (user_id = auth.uid()) 는 box_id만 알면
--   아무 방에나 자기를 넣을 수 있는 문이었다. 참여는 join_box()로만.
create policy members_read   on box_members for select using (is_member(box_id));
create policy members_update on box_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy members_delete on box_members for delete using (
  user_id = auth.uid() or is_owner(box_id)
);

-- telegrams: 봉인된 남의 전보는 행 자체가 보이지 않는다.
--   봉투(발신인·시각·분량)는 아래 telegram_envelopes 뷰가 따로 제공한다.
-- 주의: UPDATE는 갱신된 행이 SELECT 정책에도 맞아야 통과한다.
--   여기에 deleted_at is null 만 넣으면 회수(소프트 삭제)가 행을 스스로
--   안 보이게 만들어 자기 전보조차 지울 수 없다. 작성자에게는 자기가 회수한
--   행이 계속 보이도록 열어 둔다 — 수신함은 telegram_envelopes 뷰로 읽고,
--   그 뷰가 회수분을 걸러낸다.
create policy tg_read on telegrams for select using (
  (deleted_at is null or author_id = auth.uid())
  and is_member(box_id)
  and can_read_body(box_id, author_id, vol)
);
create policy tg_insert on telegrams for insert with check (
  is_member(box_id)
  and author_id = auth.uid()
  and deleted_at is null
  and vol = (select current_vol from boxes where id = box_id)
);
create policy tg_update on telegrams for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
-- delete 정책 없음: 소프트 삭제만 한다.

-- volumes / volume_pages: S3 — 초안은 멤버면 통과라 위조된 과거 책과 페이지를
--   직접 써넣을 수 있었다. 읽기만 열고 쓰기는 close_volume()으로만.
create policy vol_read on volumes for select
  using (deleted_at is null and is_member(box_id));
create policy page_read on volume_pages for select using (
  exists (select 1 from volumes v
          where v.id = volume_id and v.deleted_at is null and is_member(v.box_id))
);

-- ═══ 봉투 뷰 (D1) ══════════════════════════════════════════════════════════
-- 수신함이 읽는 유일한 통로. 봉인된 전보는 body가 null이고 분량만 나온다.
-- security_invoker = off → RLS를 우회하므로 뷰 안에서 멤버십을 직접 검사한다.
create view telegram_envelopes with (security_invoker = off) as
  select
    t.id,
    t.box_id,
    t.author_id,
    t.vol,
    t.created_at,
    can_read_body(t.box_id, t.author_id, t.vol) as unsealed,
    case when can_read_body(t.box_id, t.author_id, t.vol) then t.body end as body,
    case
      when char_length(t.body) <= 30 then 'short'
      when char_length(t.body) <= 70 then 'medium'
      else 'long'
    end as length_bucket
  from telegrams t
  where t.deleted_at is null
    and is_member(t.box_id);

-- ═══ 권한 ══════════════════════════════════════════════════════════════════
-- RLS는 GRANT 위에 얹히는 필터일 뿐이다. 쓰기 권한 자체를 회수한다.

revoke insert, update, delete on profiles     from anon, authenticated;
grant  update                 on profiles     to   authenticated;

revoke insert, update, delete on boxes        from anon, authenticated;
grant  update                 on boxes        to   authenticated;

revoke insert, update, delete on box_members  from anon, authenticated;
grant  update, delete         on box_members  to   authenticated;

revoke insert, update, delete on telegrams    from anon, authenticated;
grant  insert, update         on telegrams    to   authenticated;

revoke insert, update, delete on volumes      from anon, authenticated;
revoke insert, update, delete on volume_pages from anon, authenticated;

grant select on telegram_envelopes to authenticated;

-- ═══ 초대 코드 시도 제한 (S10) ═════════════════════════════════════════════
create table join_attempts (
  user_id      uuid not null references profiles(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index join_attempts_recent on join_attempts (user_id, attempted_at desc);
alter table join_attempts enable row level security;
-- 정책 없음 = 아무도 직접 못 읽고 못 쓴다. join_box()만 만진다.

-- ═══ 서버 함수 ═════════════════════════════════════════════════════════════

-- ── 초대 코드 생성 (혼동 문자 I O 0 1 제외) ────────────────────────────────
create or replace function gen_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  s text := '';
  i int;
begin
  for i in 1..8 loop
    if i = 5 then s := s || '-'; end if;
    s := s || substr(alpha, 1 + floor(random() * 32)::int, 1);
  end loop;
  return s;
end $$;

-- ── 1. 전보함 만들기 ──────────────────────────────────────────────────────
create or replace function create_box(
  p_name text, p_paper text, p_type text, p_sealed boolean default true
) returns table (box_id uuid, box_name text, invite_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_code text;
  i int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.' using errcode='P0001'; end if;

  perform set_config('olrw.internal', 'on', true);

  for i in 1..8 loop
    v_code := gen_invite_code();
    exit when not exists (select 1 from boxes b where b.invite_code = v_code);
    v_code := null;
  end loop;
  if v_code is null then
    raise exception '코드 생성에 실패했습니다. 다시 시도해 주세요.' using errcode='P0001';
  end if;

  insert into boxes (name, invite_code, owner_id, sealed)
  values (left(coalesce(nullif(trim(p_name), ''), '이름 없는 전보함'), 20),
          v_code, v_uid, coalesce(p_sealed, true))
  returning id into v_id;

  insert into box_members (box_id, user_id, paper_color, type_color)
  values (v_id, v_uid, p_paper, p_type);

  return query select v_id, (select b.name from boxes b where b.id = v_id), v_code;
end $$;

-- ── 2. 코드로 참여 ────────────────────────────────────────────────────────
-- 반환값 최소화: 존재 여부와 이름만. 실패 사유는 구분해서 알려준다.
create or replace function join_box(p_code text, p_paper text, p_type text)
returns table (box_id uuid, box_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_norm  text;
  v_paper text;
  b       record;
  v_tries int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.' using errcode='P0001'; end if;

  -- S10: 시간당 10회. 코드 브루트포스를 막는다.
  select count(*) into v_tries
  from join_attempts where user_id = v_uid and attempted_at > now() - interval '1 hour';
  if v_tries >= 10 then
    raise exception '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' using errcode='P0001';
  end if;
  insert into join_attempts (user_id) values (v_uid);

  -- ABCD2345 로 붙여 넣어도, abcd-2345 로 넣어도 받는다.
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if char_length(v_norm) <> 8 then
    raise exception '코드 형식이 올바르지 않습니다. (예: ABCD-2345)' using errcode='P0001';
  end if;
  v_norm := substr(v_norm, 1, 4) || '-' || substr(v_norm, 5, 4);

  select id, name into b from boxes where invite_code = v_norm;
  if not found then
    raise exception '해당 코드의 전보함을 찾을 수 없습니다.' using errcode='P0001';
  end if;

  if exists (select 1 from box_members m where m.box_id = b.id and m.user_id = v_uid) then
    return query select b.id, b.name;   -- 이미 멤버. 조용히 통과시킨다.
    return;
  end if;

  if (select count(*) from box_members m where m.box_id = b.id) >= 4 then
    raise exception '정원이 가득 찼습니다. (최대 4명)' using errcode='P0001';
  end if;

  -- 고른 용지색이 이미 쓰이고 있으면 남은 색 중 첫 번째로 돌린다.
  -- 참여자는 이 전보함의 멤버를 미리 볼 수 없으므로(RLS) 겹치는 것은 그 사람 잘못이 아니다.
  if exists (select 1 from box_members m where m.box_id = b.id and m.paper_color = p_paper) then
    -- with ordinality + order by 가 필요하다. limit 1 만 두면 어떤 색이 나올지
    -- 플래너에 달린다 — 실제로 실행 계획에 따라 결과가 달라졌다.
    select t.c into v_paper
    from unnest(array['ivory','blush','sage','powder','lilac','wheat','clay','mist'])
         with ordinality as t(c, ord)
    where not exists (select 1 from box_members m where m.box_id = b.id and m.paper_color = t.c)
    order by t.ord
    limit 1;
  else
    v_paper := p_paper;
  end if;

  perform set_config('olrw.internal', 'on', true);
  insert into box_members (box_id, user_id, paper_color, type_color)
  values (b.id, v_uid, v_paper, p_type);

  return query select b.id, b.name;
end $$;

-- ── 3. 함께 읽기 시작 (D2) ────────────────────────────────────────────────
-- 이번 권의 봉인을 푼다. 한 번 열면 되돌아가지 않는다.
-- 혼자 마감을 시작해도 나머지 멤버가 곧바로 전문을 볼 수 있게 된다 (D4 완충).
create or replace function begin_reading(p_box_id uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_at timestamptz;
begin
  if not is_member(p_box_id) then
    raise exception '이 전보함의 참여자가 아닙니다.' using errcode='P0001';
  end if;

  select reading_started_at into v_at from boxes where id = p_box_id;
  if v_at is not null then return v_at; end if;

  perform set_config('olrw.internal', 'on', true);
  update boxes set reading_started_at = now() where id = p_box_id
    returning reading_started_at into v_at;
  return v_at;
end $$;

-- ── 4. 만남 마감 · 제본 ───────────────────────────────────────────────────
-- 스냅샷 조립 · vol 증가 · 원본 소프트 삭제를 한 트랜잭션에서 서버가 한다.
-- 클라이언트에서 돌던 시절에는 두 명이 동시에 누르면 같은 vol로 두 권이
-- 생기거나 전보가 사라졌다 (AUDIT §04).
create or replace function close_volume(
  p_box_id        uuid,
  p_title         text default '',
  p_cover_kind    text default 'color',
  p_cover_value   text default 'sage',
  p_read_together boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_vol   int;
  v_id    uuid;
  v_count int;
  v_start timestamptz;
  v_end   timestamptz;
begin
  if not is_member(p_box_id) then
    raise exception '이 전보함의 참여자가 아닙니다.' using errcode='P0001';
  end if;

  -- 행 잠금. 동시에 두 명이 마감을 눌러도 한 번만 통과한다.
  select current_vol into v_vol from boxes where id = p_box_id for update;

  select count(*), min(created_at), max(created_at)
    into v_count, v_start, v_end
  from telegrams
  where box_id = p_box_id and vol = v_vol and deleted_at is null;

  -- AUDIT §04: 0건 마감이 조용히 실패해 5.8초 애니메이션 끝에 빈 화면이 남았다.
  if v_count = 0 then
    raise exception '묶을 전보가 없습니다.' using errcode='P0001';
  end if;

  perform set_config('olrw.internal', 'on', true);

  insert into volumes (
    box_id, vol, title, cover_kind, cover_value,
    period_start, period_end, page_count, read_together, met_at, closed_at
  ) values (
    p_box_id, v_vol, left(coalesce(trim(p_title), ''), 20),
    p_cover_kind, p_cover_value,
    v_start, v_end, v_count, coalesce(p_read_together, false), now(), now()
  ) returning id into v_id;

  -- 스냅샷. 발신인 이름과 용지색을 지금 값으로 복사한다.
  -- 나중에 이름이나 색을 바꿔도 이 책은 변하지 않는다.
  insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
  select
    v_id,
    row_number() over (order by t.created_at),
    t.author_id,
    coalesce(p.display_name, '?'),
    coalesce(m.paper_color, 'ivory'),
    t.body,
    t.created_at
  from telegrams t
  left join profiles    p on p.id = t.author_id
  left join box_members m on m.box_id = t.box_id and m.user_id = t.author_id
  where t.box_id = p_box_id and t.vol = v_vol and t.deleted_at is null;

  -- 원본은 파기하지 않는다. 권으로 넘어갔다는 표시만 남긴다.
  update telegrams set deleted_at = now()
  where box_id = p_box_id and vol = v_vol and deleted_at is null;

  -- 다음 권을 연다. 봉인도 다시 걸린다.
  update boxes
     set current_vol = v_vol + 1,
         reading_started_at = null
   where id = p_box_id;

  return v_id;
end $$;

-- ── 5. 전보함 나가기 (S8: 소유자 이양) ────────────────────────────────────
-- 초안에는 owner_id가 on delete restrict인데 이양 로직이 없어,
-- 방장이 나가면 전보함이 잠겼다.
create or replace function leave_box(p_box_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_next uuid;
begin
  if not is_member(p_box_id) then return; end if;

  perform set_config('olrw.internal', 'on', true);
  delete from box_members where box_id = p_box_id and user_id = v_uid;

  select user_id into v_next
  from box_members where box_id = p_box_id
  order by joined_at limit 1;

  if v_next is null then
    -- 마지막 사람이 나갔다. 즉시 파기하지 않는다(스펙 §7-5) — 서가만 내리고
    -- 전보함 행은 남긴다. 멤버가 없으므로 누구에게도 보이지 않는다.
    update volumes set deleted_at = now() where box_id = p_box_id and deleted_at is null;
  elsif exists (select 1 from boxes where id = p_box_id and owner_id = v_uid) then
    update boxes set owner_id = v_next where id = p_box_id;
  end if;
end $$;

-- 전보 회수는 함수를 두지 않는다. 클라이언트가 직접 소프트 삭제하면 되고,
--   update telegrams set deleted_at = now() where id = ?
-- tg_update 정책(작성자만)과 telegrams_guard(본문·vol 수정 불가, 되살리기 불가)가
-- 이미 그 경로를 완전히 막고 있다. 함수를 하나 더 두면 실패 지점만 늘어난다.

-- ── 실행 권한 ─────────────────────────────────────────────────────────────
revoke all on function create_box(text,text,text,boolean)          from public;
revoke all on function join_box(text,text,text)                    from public;
revoke all on function begin_reading(uuid)                         from public;
revoke all on function close_volume(uuid,text,text,text,boolean)   from public;
revoke all on function leave_box(uuid)                             from public;
revoke all on function gen_invite_code()                           from public;

grant execute on function create_box(text,text,text,boolean)        to authenticated;
grant execute on function join_box(text,text,text)                  to authenticated;
grant execute on function begin_reading(uuid)                       to authenticated;
grant execute on function close_volume(uuid,text,text,text,boolean) to authenticated;
grant execute on function leave_box(uuid)                           to authenticated;

-- ═══ Storage (S11) ═════════════════════════════════════════════════════════
-- 표지 사진. base64를 행에 넣지 않는다. 경로는 covers/{box_id}/{volume_id}.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('covers', 'covers', true, 2097152, array['image/jpeg','image/webp','image/png'])
on conflict (id) do nothing;

create policy covers_read on storage.objects for select
  using (bucket_id = 'covers');

create policy covers_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'covers'
    and is_member((storage.foldername(name))[1]::uuid)
  );

create policy covers_update on storage.objects for update to authenticated
  using (
    bucket_id = 'covers'
    and is_member((storage.foldername(name))[1]::uuid)
  );
