-- ═══════════════════════════════════════════════════════════════════════════
-- OLRW — 옛 전보함 이관 (Firestore → Neon)
--
--   원본: sample/legacy-export.sample.json (2026-01-02T03:04:05.678Z 에 꺼냄 · 저장소에 올리지 않는다)
--   생성: node neon/migration/build.mjs  ← 이 파일을 손으로 고치지 않는다
--   절차: docs/DATA-MIGRATION.md
--
--   전보함 2 · 참여 5 · 이번 권 전보 1
--   · 제본된 권 3 · 제본된 전보 7
--
-- 이 파일은 테이블에 직접 INSERT 한다. 앱이 아니라 마이그레이션 안에서만 열리는
-- 문이다 — 이관은 소유자·초대코드·created_at 을 원본 그대로 살려야 해서
-- create_box / join_box 로는 할 수 없다. 앱 코드에는 이 문을 열지 않는다.
--
-- 두 번 돌려도 안전하다. 모든 id 를 옛 id 에서 결정론적으로 뽑고
-- (같은 원본 → 같은 uuid), INSERT 는 전부 on conflict do nothing 이다.
--
-- 표지 사진은 아직 없다. Neon 에는 Storage 가 없어 (D14) 아래 권들은 색 표지
-- 'sage' 로 들어간다. 올릴 곳이 생기면 이 목록으로 UPDATE 한다:
--   견본 전보함 VOL.2
-- ═══════════════════════════════════════════════════════════════════════════

-- 앞선 실행이 오류로 끝났으면 그 트랜잭션이 열린 채 남아 있고, 그대로는
-- 아무 문장도 통하지 않는다. 편집기에서 ROLLBACK 버튼을 찾을 필요 없이
-- 여기서 정리한다. 열린 것이 없으면 경고 한 줄만 나오고 지나간다.
rollback;

begin;

-- ═══ 1. 사람 짝짓기 — 여기만 채운다 ═══════════════════════════════════════
--
-- 옛 파이어베이스 uid 와 새 Neon 계정 uuid 는 서로 남이다. 아래 3명이 새 앱에서
-- 먼저 가입해야 하고, uuid 는 Neon 콘솔 → Tables → profiles 에서 받는다.
--
-- null 을 '…' 로 바꾼다. **아는 사람만 채워도 된다.**
-- 사람이 다 모인 전보함만 이번에 들어가고, 나머지는 조용히 건너뛴다. 빠진
-- 사람이 가입한 뒤 이 파일을 그대로 다시 부으면 그때 들어간다 — id 가 전부
-- 결정론적이라 이미 들어간 것은 두 번 들어가지 않는다.
--
-- 임시 테이블이 아니라 진짜 테이블이다 — 편집기가 문장을 따로 실행해도 살아
-- 있어야 한다. 맨 끝(§7)에서 지운다.

drop table if exists legacy_user;
create table legacy_user (
  legacy_uid   text primary key,
  label        text not null,
  display_name text not null,   -- 프로필이 없을 때 이 이름으로 세운다
  id           uuid
);

insert into legacy_user (legacy_uid, label, display_name, id) values
  ('AAAAAAAAAAAAAAAAAAAAAAAAAAA1', '안 (ann@example.test)', '안', null), -- ← 여기에 uuid
  ('BBBBBBBBBBBBBBBBBBBBBBBBBBB2', '보',                    '보', null), -- ← 여기에 uuid
  ('CCCCCCCCCCCCCCCCCCCCCCCCCCC3', '초',                    '초', null)  -- ← 여기에 uuid
;

-- 전보함마다 누가 있어야 온전한가. 한 사람이라도 비면 그 전보함은 건너뛴다.
drop table if exists legacy_box_need;
create table legacy_box_need (box_id uuid, legacy_uid text, primary key (box_id, legacy_uid));
insert into legacy_box_need (box_id, legacy_uid) values
  ('c76e5337-152b-9171-e047-b83b9c21d55c', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA1'), -- 견본 전보함 · 안 (ann@example.test)
  ('c76e5337-152b-9171-e047-b83b9c21d55c', 'BBBBBBBBBBBBBBBBBBBBBBBBBBB2'), -- 견본 전보함 · 보
  ('c76e5337-152b-9171-e047-b83b9c21d55c', 'CCCCCCCCCCCCCCCCCCCCCCCCCCC3'), -- 견본 전보함 · 초
  ('01618838-922b-cebc-597e-823baf3c0d06', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA1'), -- 견본 둘 · 안 (ann@example.test)
  ('01618838-922b-cebc-597e-823baf3c0d06', 'BBBBBBBBBBBBBBBBBBBBBBBBBBB2')  -- 견본 둘 · 보
;

-- 그 전보함이 온전히 들어갔다면 몇 행이어야 하는가 (§7 이 대조한다).
drop table if exists legacy_box_expect;
create table legacy_box_expect (
  box_id uuid primary key, name text not null,
  members int, telegrams int, volumes int, pages int
);
insert into legacy_box_expect (box_id, name, members, telegrams, volumes, pages) values
  ('c76e5337-152b-9171-e047-b83b9c21d55c', '견본 전보함', 3, 1, 2, 5),
  ('01618838-922b-cebc-597e-823baf3c0d06', '견본 둘',     2, 0, 1, 2)
;

-- 프로필이 아직 없는 사람은 여기서 옛 이름으로 세운다.
--
-- profiles 행은 원래 앱이 첫 로그인 때 ensure_profile() 로 만든다. 그런데
-- 계정만 만들고 아직 앱 화면까지 못 들어온 사람은 그 행이 없고, boxes.owner_id
-- 와 volume_pages.author_id 가 profiles 를 참조하므로 이관이 통째로 막힌다.
--
-- 옛 이름으로 세워 두면 그 사람이 나중에 로그인해도 이름이 덮이지 않는다 —
-- ensure_profile() 은 'on conflict (id) do nothing' 이다.
drop table if exists legacy_made_profile;
create table legacy_made_profile (id uuid, display_name text);
with made as (
  insert into profiles (id, display_name)
  select u.id, u.display_name from legacy_user u
   where u.id is not null
     and not exists (select 1 from profiles p where p.id = u.id)
  on conflict (id) do nothing
  returning id, display_name
)
insert into legacy_made_profile select id, display_name from made;

do $$
declare v_missing text; v_skip text; v_made text;
begin
  -- 방금 세운 프로필을 눈으로 확인할 수 있게 적어 둔다. 여기 낯선 이름이
  -- 있으면 uuid 를 잘못 넣은 것이다 — 그때는 되돌리고 다시 부으면 된다
  -- (docs/DATA-MIGRATION.md 의 「잘못 넣었을 때」).
  select string_agg(display_name || ' (' || id || ')', ', ') into v_made
    from legacy_made_profile;
  if v_made is not null then
    raise notice '프로필을 새로 세운 사람: %', v_made;
  end if;

  -- 아직 안 채운 사람이 있으면 알리되 멈추지는 않는다.
  select string_agg(label, ', ') into v_missing from legacy_user where id is null;
  if v_missing is not null then
    raise notice '아직 uuid 가 없는 사람: %', v_missing;
  end if;

  select string_agg(e.name, ', ') into v_skip
    from legacy_box_expect e
   where exists (select 1 from legacy_box_need n
                   join legacy_user u on u.legacy_uid = n.legacy_uid
                  where n.box_id = e.box_id and u.id is null);
  if v_skip is not null then
    raise notice '이번에 건너뛰는 전보함: % (그 사람이 가입한 뒤 이 파일을 다시 부으면 들어갑니다)', v_skip;
  end if;

  if not exists (select 1 from legacy_user where id is not null) then
    raise exception E'uuid 를 하나도 채우지 않았습니다.'
      '\n       Neon 콘솔 → Tables → profiles 에서 받아 이 파일 §1 에 적으세요.';
  end if;
end $$;

-- ═══ 2. 전보함 ════════════════════════════════════════════════════════════
-- **초대 코드는 새로 뽑는다.** 옛 coupleCode 는 한때 공개 저장소에 올라가
-- 있었다. 그대로 살리면 그 코드를 본 사람이 이관된 전보함에 그냥 들어온다 —
-- 정원 4명에 빈자리가 있으면 그것으로 끝이다.
--
-- 새 코드는 이관을 마친 뒤 앱의 전보함 설정에서 볼 수 있고, §7 이 마칠 때
-- 한 번 찍어 준다. 옛 코드를 기억하고 있던 사람에게는 새 코드를 알려 준다.
--
-- 봉인은 기본값 그대로 true (D1). 권 번호의 구멍은 메꾸지 않는다.

insert into boxes (id, name, invite_code, owner_id, current_vol, sealed, created_at)
select t.id::uuid, t.name, gen_invite_code(), u.id, t.vol, true, t.created_at::timestamptz
from (values
  ('c76e5337-152b-9171-e047-b83b9c21d55c', '견본 전보함', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA1', 3, '2026-01-02T00:00:00.000Z'), -- 견본 전보함
  ('01618838-922b-cebc-597e-823baf3c0d06', '견본 둘',     'AAAAAAAAAAAAAAAAAAAAAAAAAAA1', 2, '2026-02-01T00:00:00.000Z')  -- 견본 둘
) as t(id, name, legacy_uid, vol, created_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
-- 한 사람이라도 아직 없으면 이 전보함은 통째로 건너뛴다. 반쪽만 넣으면
-- 권의 쪽수가 어긋나 서가가 거짓말을 한다.
where not exists (
  select 1 from legacy_box_need n
    join legacy_user lu on lu.legacy_uid = n.legacy_uid
   where n.box_id = t.id::uuid and lu.id is null)
on conflict do nothing;

-- ═══ 3. 참여자 ════════════════════════════════════════════════════════════
-- paper_color(용지색)는 공개 정보라 원본 그대로 둔다. type_color 는 타자기이고
-- 개인 설정이다 — 옛 색을 네 대 중 가까운 것으로 옮긴다 (D9). 앱에서 바꿀 수 있다.

insert into box_members (box_id, user_id, paper_color, type_color, joined_at)
select t.box_id::uuid, u.id, t.paper, t.type, t.joined_at::timestamptz
from (values
  ('c76e5337-152b-9171-e047-b83b9c21d55c', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA1', 'powder', 'sugar', '2026-01-02T00:00:00.000Z'), -- 견본 전보함 · 안 · 옛 violet
  ('c76e5337-152b-9171-e047-b83b9c21d55c', 'BBBBBBBBBBBBBBBBBBBBBBBBBBB2', 'lilac',  'moss',  '2026-01-02T01:00:00.000Z'), -- 견본 전보함 · 보 · 옛 green
  ('c76e5337-152b-9171-e047-b83b9c21d55c', 'CCCCCCCCCCCCCCCCCCCCCCCCCCC3', 'blush',  'steel', '2026-01-02T02:00:00.000Z'), -- 견본 전보함 · 초 · 옛 blue
  ('01618838-922b-cebc-597e-823baf3c0d06', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA1', 'powder', 'oak',   '2026-02-01T00:00:00.000Z'), -- 견본 둘 · 안 · 옛 ochre
  ('01618838-922b-cebc-597e-823baf3c0d06', 'BBBBBBBBBBBBBBBBBBBBBBBBBBB2', 'blush',  'moss',  '2026-02-01T01:00:00.000Z')  -- 견본 둘 · 보 · 옛 teal
) as t(box_id, legacy_uid, paper, type, joined_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
-- §2 에서 건너뛴 전보함은 여기에도 없다. 조건을 두 번 적지 않는다.
join boxes b on b.id = t.box_id::uuid
on conflict do nothing;

-- ═══ 4. 이번 권 전보 (아직 제본되지 않은 것) ══════════════════════════════

insert into telegrams (id, box_id, author_id, body, vol, created_at)
select t.id::uuid, t.box_id::uuid, u.id, t.body, t.vol, t.created_at::timestamptz
from (values
  ('dd58113e-d72f-242e-b0b8-62f46bce7fb4', 'c76e5337-152b-9171-e047-b83b9c21d55c', 'AAAAAAAAAAAAAAAAAAAAAAAAAAA1', '아직 제본되지 않은 전보', 3, '2026-01-20T04:05:06.000Z') -- 견본 전보함
) as t(id, box_id, legacy_uid, body, vol, created_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
join boxes b on b.id = t.box_id::uuid
on conflict do nothing;

-- ═══ 5. 제본된 권 ═════════════════════════════════════════════════════════
-- period_start / period_end 는 close_volume() 과 같게 첫 전보·마지막 전보의
-- 시각이다. 원본의 기간 문자열과 날짜가 전부 일치하는 것을 확인했다.
-- 페이지 시각에는 연도가 없어 권의 기간에서 가져왔고, 시간대는 KST 로 읽었다.
--
-- read_together 는 true 로 둔다. 옛 앱에는 '함께 읽기' 단계가 없었다 (D2 는 새
-- 결정이다). false 로 두면 옛 책 열네 권마다 "함께 읽기를 건너뛰고 제본했습니다"
-- 가 찍힌다 — 없던 일을 건너뛰었다고 적느니 비워 두는 편이 낫다.
--
-- met_at 은 기본값(now())이 아니라 closed_at 과 같은 값을 넣는다.
-- 제목이 VOL.n 라벨과 같으면 비운다 — 서가가 VOL.n 을 따로 그린다.

insert into volumes (id, box_id, vol, title, cover_kind, cover_value,
                     period_start, period_end, page_count, read_together,
                     met_at, closed_at)
select t.id::uuid, t.box_id::uuid, t.vol, t.title, 'color', t.cover,
       t.period_start::timestamptz, t.period_end::timestamptz, t.pages, true,
       t.closed_at::timestamptz, t.closed_at::timestamptz
from (values
  ('df84a6d7-2770-36f8-085a-75e862878410', 'c76e5337-152b-9171-e047-b83b9c21d55c', 1, '',          'sage', '2026-01-02 09:00:00+09', '2026-01-05 11:00:00+09', 3, '2026-01-06T00:00:00.000Z'), -- 견본 전보함 VOL.1
  ('c5d71cb2-6b9d-916a-eb9d-1c8c7dae4cdd', 'c76e5337-152b-9171-e047-b83b9c21d55c', 2, '견본 제목', 'sage', '2026-01-07 08:00:00+09', '2026-01-09 20:00:00+09', 2, '2026-01-10T00:00:00.000Z'), -- 견본 전보함 VOL.2 · 옛 표지는 사진
  ('658cc291-48c3-17c8-7743-6723d7a03627', '01618838-922b-cebc-597e-823baf3c0d06', 1, '',          'navy', '2026-02-01 09:00:00+09', '2026-02-03 18:00:00+09', 2, '2026-02-04T00:00:00.000Z')  -- 견본 둘 VOL.1
) as t(id, box_id, vol, title, cover, period_start, period_end, pages, closed_at)
join boxes b on b.id = t.box_id::uuid
on conflict do nothing;

-- ═══ 6. 제본된 전보 (스냅샷) ══════════════════════════════════════════════
-- 이름과 용지색은 제본 시점 값이다. 지금 프로필을 참조하지 않는다.
-- 'a' / 'b' 로만 적힌 더 옛 형식은 사람을 확정해 이름·용지색을 채웠다 —
-- 근거는 neon/migration/build.mjs 의 LEGACY_ALIAS 주석.

-- ── 견본 전보함 VOL.1 · 3통 ────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('df84a6d7-2770-36f8-085a-75e862878410', 1, 'AAAAAAAAAAAAAAAAAAAAAAAAAAA1', '안', 'powder', '첫 견본 전보',   '2026-01-02 09:00:00+09'),
  ('df84a6d7-2770-36f8-085a-75e862878410', 2, 'BBBBBBBBBBBBBBBBBBBBBBBBBBB2', '보', 'lilac',  '둘째 견본 전보', '2026-01-03 10:00:00+09'),
  ('df84a6d7-2770-36f8-085a-75e862878410', 3, 'CCCCCCCCCCCCCCCCCCCCCCCCCCC3', '초', 'blush',  '셋째 견본 전보', '2026-01-05 11:00:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
join volumes v on v.id = t.volume_id::uuid
on conflict do nothing;

-- ── 견본 전보함 VOL.2 · 2통 ────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('c5d71cb2-6b9d-916a-eb9d-1c8c7dae4cdd', 1, 'AAAAAAAAAAAAAAAAAAAAAAAAAAA1', '안', 'powder', '사진 표지 권의 전보', '2026-01-07 08:00:00+09'),
  ('c5d71cb2-6b9d-916a-eb9d-1c8c7dae4cdd', 2, 'BBBBBBBBBBBBBBBBBBBBBBBBBBB2', '보', 'lilac',  '그 권의 마지막 전보', '2026-01-09 20:00:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
join volumes v on v.id = t.volume_id::uuid
on conflict do nothing;

-- ── 견본 둘 VOL.1 · 2통 ────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('658cc291-48c3-17c8-7743-6723d7a03627', 1, 'AAAAAAAAAAAAAAAAAAAAAAAAAAA1', '안', 'powder', '옛 형식 전보 (a)', '2026-02-01 09:00:00+09'), -- 옛 형식
  ('658cc291-48c3-17c8-7743-6723d7a03627', 2, 'BBBBBBBBBBBBBBBBBBBBBBBBBBB2', '보', 'blush',  '옛 형식 전보 (b)', '2026-02-03 18:00:00+09')  -- 옛 형식
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
join volumes v on v.id = t.volume_id::uuid
on conflict do nothing;

-- ═══ 7. 결산 ══════════════════════════════════════════════════════════════
-- 이번에 들어가기로 한 전보함마다, 있어야 할 행이 다 있는지 하나씩 센다.
-- 하나라도 모자라면 여기서 통째로 되돌린다 — 반쯤 들어간 서가를 남기지 않는다.
-- 건너뛴 전보함은 세지 않는다. 그것은 실패가 아니라 다음 차례다.

do $$
declare
  r record;
  v_mem int; v_tg int; v_vol int; v_page int;
  v_done int := 0; v_skip int := 0;
begin
  for r in
    select e.* from legacy_box_expect e
     where not exists (select 1 from legacy_box_need n
                         join legacy_user u on u.legacy_uid = n.legacy_uid
                        where n.box_id = e.box_id and u.id is null)
     order by e.name
  loop
    if not exists (select 1 from boxes where id = r.box_id) then
      raise exception '% : 전보함이 들어가지 않았습니다.', r.name;
    end if;
    select count(*) into v_mem  from box_members where box_id = r.box_id;
    select count(*) into v_tg   from telegrams
      where box_id = r.box_id and deleted_at is null;
    select count(*) into v_vol  from volumes where box_id = r.box_id;
    select coalesce(sum(v.page_count), 0) into v_page
      from volumes v where v.box_id = r.box_id;

    raise notice '% : 참여 %/% · 이번 권 전보 %/% · 제본된 권 %/% · 쪽 %/%',
      r.name, v_mem, r.members, v_tg, r.telegrams, v_vol, r.volumes, v_page, r.pages;

    if v_mem < r.members or v_tg < r.telegrams
       or v_vol < r.volumes or v_page < r.pages then
      raise exception '% : 들어간 행이 모자랍니다.', r.name;
    end if;
    v_done := v_done + 1;
  end loop;

  -- 권마다 적어 둔 쪽수와 실제 스냅샷 수가 어긋나면 서가가 거짓말을 한다.
  if exists (
    select 1 from volumes v
      join legacy_box_expect e on e.box_id = v.box_id
     where v.page_count <> (select count(*) from volume_pages p where p.volume_id = v.id)
  ) then
    raise exception '쪽수가 어긋난 권이 있습니다.';
  end if;

  select count(*) into v_skip from legacy_box_expect e
   where exists (select 1 from legacy_box_need n
                   join legacy_user u on u.legacy_uid = n.legacy_uid
                  where n.box_id = e.box_id and u.id is null);
  raise notice '들어간 전보함 % · 건너뛴 전보함 %', v_done, v_skip;

  -- 초대 코드는 새로 뽑았다. 옛 코드는 더 이상 통하지 않는다.
  for r in select b.name, b.invite_code from boxes b
             join legacy_box_expect e on e.box_id = b.id order by b.name
  loop
    raise notice '새 초대 코드 · % : %', r.name, r.invite_code;
  end loop;
  if v_done = 0 then
    raise exception '들어간 전보함이 하나도 없습니다. §1 에 uuid 를 채우세요.';
  end if;
end $$;

drop table legacy_user;
drop table legacy_box_need;
drop table legacy_box_expect;
drop table legacy_made_profile;

commit;
