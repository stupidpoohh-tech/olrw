-- OLRW initial schema
-- 설계 근거: docs/PORTING-SPEC.md §7. 규칙 위반 금지.

create extension if not exists "pgcrypto";

-- profiles -------------------------------------------------------------
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  created_at   timestamptz not null default now()
);

-- boxes ----------------------------------------------------------------
create table boxes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '이름 없는 전보함',
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  owner_id    uuid not null references profiles(id) on delete restrict,
  current_vol int  not null default 1 check (current_vol >= 1),
  created_at  timestamptz not null default now()
);

-- box_members ----------------------------------------------------------
-- paper_color: 공개(발신인 구분) / type_color: 개인 설정(본인만 봄)
create table box_members (
  box_id      uuid not null references boxes(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  paper_color text not null check (paper_color in
    ('ivory','blush','sage','powder','lilac','wheat','clay','mist')),
  type_color  text not null check (type_color in
    ('green','teal','blue','plum','rose','terra','ochre','stone')),
  joined_at   timestamptz not null default now(),
  primary key (box_id, user_id)
);

-- 정원 4명. 의도적 상한 — 올리지 않는다.
create or replace function enforce_box_capacity() returns trigger
language plpgsql as $$
begin
  if (select count(*) from box_members where box_id = new.box_id) >= 4 then
    raise exception '전보함 정원이 찼습니다.';
  end if;
  return new;
end $$;

create trigger box_capacity before insert on box_members
  for each row execute function enforce_box_capacity();

-- telegrams ------------------------------------------------------------
create table telegrams (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid not null references boxes(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete restrict,
  body       text not null check (char_length(body) between 1 and 2000),
  vol        int  not null check (vol >= 1),
  created_at timestamptz not null default now(),
  deleted_at timestamptz          -- soft delete
);
create index telegrams_box_vol on telegrams (box_id, vol, created_at);

-- volumes --------------------------------------------------------------
create table volumes (
  id           uuid primary key default gen_random_uuid(),
  box_id       uuid not null references boxes(id) on delete cascade,
  vol          int  not null,
  title        text not null default '',
  cover        text not null default 'sage',   -- 색 id 또는 'photo'
  cover_url    text,                            -- Storage URL. base64 금지
  period_start timestamptz,
  period_end   timestamptz,
  page_count   int  not null default 0,
  closed_at    timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (box_id, vol)
);

-- volume_pages ---------------------------------------------------------
-- 제본 시점 스냅샷. author_name / paper_color 를 그때 값으로 복사한다.
-- 이후 이름·색이 바뀌어도 과거 책은 변하지 않아야 한다.
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

-- RLS ------------------------------------------------------------------
alter table profiles     enable row level security;
alter table boxes        enable row level security;
alter table box_members  enable row level security;
alter table telegrams    enable row level security;
alter table volumes      enable row level security;
alter table volume_pages enable row level security;

create or replace function is_member(b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from box_members where box_id = b and user_id = auth.uid()
  );
$$;

-- profiles: 본인 + 같은 전보함 멤버만
create policy profiles_read on profiles for select using (
  id = auth.uid() or exists (
    select 1 from box_members m1
    join box_members m2 on m1.box_id = m2.box_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  )
);
create policy profiles_write on profiles for insert with check (id = auth.uid());
create policy profiles_update on profiles for update using (id = auth.uid());

-- boxes: 멤버만. 초대코드 조회는 아래 join_box RPC로만
create policy boxes_read   on boxes for select using (is_member(id));
create policy boxes_insert on boxes for insert with check (owner_id = auth.uid());
create policy boxes_update on boxes for update using (owner_id = auth.uid());

create policy members_read   on box_members for select using (is_member(box_id));
create policy members_insert on box_members for insert with check (user_id = auth.uid());
create policy members_update on box_members for update using (user_id = auth.uid());
create policy members_delete on box_members for delete using (
  user_id = auth.uid() or exists (
    select 1 from boxes where id = box_id and owner_id = auth.uid()
  )
);

create policy tg_read   on telegrams for select using (is_member(box_id));
create policy tg_insert on telegrams for insert with check (
  is_member(box_id) and author_id = auth.uid()
);
create policy tg_update on telegrams for update using (author_id = auth.uid());

create policy vol_read   on volumes for select using (is_member(box_id));
create policy vol_insert on volumes for insert with check (is_member(box_id));
create policy vol_update on volumes for update using (
  exists (select 1 from boxes where id = box_id and owner_id = auth.uid())
);

create policy page_read on volume_pages for select using (
  exists (select 1 from volumes v where v.id = volume_id and is_member(v.box_id))
);
create policy page_insert on volume_pages for insert with check (
  exists (select 1 from volumes v where v.id = volume_id and is_member(v.box_id))
);

-- 초대코드 참여: 코드로 박스를 직접 읽게 열지 않고 RPC로만 처리한다.
-- 반환값 최소화 — 존재 여부와 이름만.
create or replace function join_box(code text, paper text, typec text)
returns table (box_id uuid, box_name text)
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select id, name into b from boxes where invite_code = upper(code);
  if b is null then raise exception '없는 코드입니다.'; end if;

  insert into box_members (box_id, user_id, paper_color, type_color)
  values (b.id, auth.uid(), paper, typec)
  on conflict (box_id, user_id) do nothing;

  return query select b.id, b.name;
end $$;

revoke all on function join_box(text, text, text) from public;
grant execute on function join_box(text, text, text) to authenticated;
