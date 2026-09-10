-- ═══════════════════════════════════════════════════════════════════════════
-- 운영 데이터 표본 — **읽기 전용**
--
--   psql "$NEON_READONLY_URL" -v ON_ERROR_STOP=1 -f neon/tests/prod_smoke.sql
--
-- 이관이 끝난 뒤 운영 DB 가 앞뒤가 맞는지만 본다. 한 줄도 쓰지 않는다 —
-- 트랜잭션을 읽기 전용으로 못박고, 문장은 전부 select 다.
--
-- **실제 값을 찍지 않는다.** 이메일·전보 본문·초대 코드·uuid 는 한 번도
-- 출력하지 않고, 세거나 있는지 없는지만 말한다. CI 로그는 공개된다.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
\pset pager off
\timing off

begin read only;

\echo ''
\echo '━━━ 규모 (값이 아니라 수만 본다) ━━━'
select
  (select count(*) from profiles)                                  as "사람",
  (select count(*) from boxes)                                     as "전보함",
  (select count(*) from box_members)                               as "참여",
  (select count(*) from telegrams where deleted_at is null)         as "이번 권 전보",
  (select count(*) from telegrams where deleted_at is not null)     as "회수·제본된 전보",
  (select count(*) from volumes where deleted_at is null)           as "제본된 권",
  (select count(*) from volume_pages)                              as "제본된 쪽";

\echo ''
\echo '━━━ 앞뒤가 맞는가 (전부 0 이어야 한다) ━━━'
select
  -- 사람과 전보함이 이어져 있는가
  (select count(*) from box_members m
     left join profiles p on p.id = m.user_id where p.id is null)
    as "프로필 없는 참여",
  (select count(*) from boxes b
     left join profiles p on p.id = b.owner_id where p.id is null)
    as "주인 없는 전보함",
  (select count(*) from boxes b
     where not exists (select 1 from box_members m where m.box_id = b.id))
    as "참여자 없는 전보함",

  -- 권과 쪽이 이어져 있는가
  (select count(*) from volume_pages p
     left join volumes v on v.id = p.volume_id where v.id is null)
    as "권 없는 쪽",
  (select count(*) from volumes v
     left join boxes b on b.id = v.box_id where b.id is null)
    as "전보함 없는 권",
  (select count(*) from volumes v where v.deleted_at is null
     and not exists (select 1 from volume_pages p where p.volume_id = v.id))
    as "빈 권",
  (select count(*) from volumes v where v.deleted_at is null
     and v.page_count <> (select count(*) from volume_pages p where p.volume_id = v.id))
    as "쪽수가 어긋난 권",

  -- 전보와 사람이 이어져 있는가
  (select count(*) from telegrams t
     left join profiles p on p.id = t.author_id where p.id is null)
    as "발신인 없는 전보",
  (select count(*) from telegrams t
     left join boxes b on b.id = t.box_id where b.id is null)
    as "전보함 없는 전보";

\echo ''
\echo '━━━ 지금 권과 지난 권이 갈라져 있는가 (전부 0) ━━━'
select
  -- 아직 제본하지 않은 전보는 반드시 이번 권이어야 한다
  (select count(*) from telegrams t join boxes b on b.id = t.box_id
     where t.deleted_at is null and t.vol <> b.current_vol)
    as "이번 권이 아닌 살아 있는 전보",
  -- 제본된 권 번호가 이번 권을 넘어설 수 없다
  (select count(*) from volumes v join boxes b on b.id = v.box_id
     where v.deleted_at is null and v.vol >= b.current_vol)
    as "이번 권 이상인 제본된 권",
  -- 같은 전보함에 같은 권 번호가 둘일 수 없다
  (select count(*) from (
     select box_id, vol from volumes where deleted_at is null
     group by box_id, vol having count(*) > 1) x)
    as "권 번호가 겹친 권";

\echo ''
\echo '━━━ 값의 모양 (전부 0) ━━━'
select
  (select count(*) from boxes
     where invite_code !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$')
    as "형식이 어긋난 초대 코드",
  (select count(*) from boxes where current_vol < 1) as "권 번호가 이상한 전보함",
  (select count(*) from profiles
     where char_length(display_name) < 1 or char_length(display_name) > 12)
    as "길이가 이상한 이름",
  -- 날짜가 뒤집혔거나 미래로 가 있는가
  (select count(*) from volumes where deleted_at is null and period_end < period_start)
    as "기간이 뒤집힌 권",
  (select count(*) from volumes where deleted_at is null and closed_at < period_start)
    as "닫힌 시각이 앞선 권",
  (select count(*) from volumes where deleted_at is null and period_start > now())
    as "미래에서 온 권",
  (select count(*) from telegrams where created_at > now()) as "미래에서 온 전보",
  -- 인코딩이 깨졌는가 — U+FFFD(치환 문자)나 널 문자가 섞였는가
  (select count(*) from volume_pages
     where body like '%' || U&'\+00FFFD' || '%' or author_name like '%' || U&'\+00FFFD' || '%')
    as "깨진 글자가 있는 쪽",
  (select count(*) from telegrams where body like '%' || U&'\+00FFFD' || '%')
    as "깨진 글자가 있는 전보";

\echo ''
\echo '━━━ 제본은 스냅샷인가 (전부 0) ━━━'
select
  (select count(*) from volume_pages where author_name is null or author_name = '')
    as "발신인 이름이 빈 쪽",
  (select count(*) from volume_pages where paper_color is null or paper_color = '')
    as "용지색이 빈 쪽",
  -- 한 권 안에서 같은 사람이 두 색으로 나오면 "용지색이 발신인" 규칙이 깨진다
  (select count(*) from (
     select volume_id, author_name from volume_pages
     group by volume_id, author_name having count(distinct paper_color) > 1) x)
    as "한 권 두 색인 발신인",
  -- 쪽 번호가 1부터 빠짐없이 이어지는가
  (select count(*) from volumes v where v.deleted_at is null
     and (select count(distinct p.ord) from volume_pages p where p.volume_id = v.id) <> v.page_count)
    as "쪽 번호가 겹치거나 빠진 권";

\echo ''
\echo '━━━ 정원 (D4 · 전부 0) ━━━'
select (select count(*) from (
  select box_id from box_members group by box_id having count(*) > 4) x)
  as "정원 4명을 넘은 전보함";

\echo ''
\echo '━━━ 이관된 사람이 새 계정과 이어져 있는가 ━━━'
-- 이관은 옛 uid 를 새 계정 uuid 로 바꿔 넣었다. 그 uuid 가 실제 프로필이면
-- 이어진 것이다 — 위 "프로필 없는 참여" 가 0 이면 그것으로 증명된다.
select
  (select count(*) from profiles p
     where exists (select 1 from box_members m where m.user_id = p.id))
    as "전보함에 속한 사람",
  (select count(*) from profiles p
     where exists (select 1 from volume_pages v where v.author_id = p.id))
    as "지난 권에 이름이 남은 사람",
  (select count(*) from profiles p
     where not exists (select 1 from box_members m where m.user_id = p.id))
    as "아직 아무 전보함에도 없는 사람";

\echo ''
\echo '━━━ 판정 ━━━'
-- 위에서 본 것 중 하나라도 0 이 아니면 여기서 멈춘다. 값만 찍고 끝나면
-- CI 는 통과로 읽는다 — 게이트가 되려면 실패해야 한다.
do $$
declare
  v_bad text := '';
  add   text;
begin
  select string_agg(name, ', ') into add from (
    select '프로필 없는 참여' as name where exists (
      select 1 from box_members m left join profiles p on p.id = m.user_id where p.id is null)
    union all select '주인 없는 전보함' where exists (
      select 1 from boxes b left join profiles p on p.id = b.owner_id where p.id is null)
    union all select '참여자 없는 전보함' where exists (
      select 1 from boxes b where not exists (select 1 from box_members m where m.box_id = b.id))
    union all select '권 없는 쪽' where exists (
      select 1 from volume_pages p left join volumes v on v.id = p.volume_id where v.id is null)
    union all select '전보함 없는 권' where exists (
      select 1 from volumes v left join boxes b on b.id = v.box_id where b.id is null)
    union all select '빈 권' where exists (
      select 1 from volumes v where v.deleted_at is null
        and not exists (select 1 from volume_pages p where p.volume_id = v.id))
    union all select '쪽수가 어긋난 권' where exists (
      select 1 from volumes v where v.deleted_at is null
        and v.page_count <> (select count(*) from volume_pages p where p.volume_id = v.id))
    union all select '발신인 없는 전보' where exists (
      select 1 from telegrams t left join profiles p on p.id = t.author_id where p.id is null)
    union all select '전보함 없는 전보' where exists (
      select 1 from telegrams t left join boxes b on b.id = t.box_id where b.id is null)
    union all select '이번 권이 아닌 살아 있는 전보' where exists (
      select 1 from telegrams t join boxes b on b.id = t.box_id
        where t.deleted_at is null and t.vol <> b.current_vol)
    union all select '이번 권 이상인 제본된 권' where exists (
      select 1 from volumes v join boxes b on b.id = v.box_id
        where v.deleted_at is null and v.vol >= b.current_vol)
    union all select '권 번호가 겹친 권' where exists (
      select 1 from (select box_id, vol from volumes where deleted_at is null
                     group by box_id, vol having count(*) > 1) x)
    union all select '형식이 어긋난 초대 코드' where exists (
      select 1 from boxes where invite_code !~
        '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$')
    union all select '길이가 이상한 이름' where exists (
      select 1 from profiles where char_length(display_name) not between 1 and 12)
    union all select '기간이 뒤집힌 권' where exists (
      select 1 from volumes where deleted_at is null and period_end < period_start)
    union all select '미래에서 온 권' where exists (
      select 1 from volumes where deleted_at is null and period_start > now())
    union all select '미래에서 온 전보' where exists (
      select 1 from telegrams where created_at > now())
    union all select '깨진 글자' where exists (
      select 1 from volume_pages where body like '%' || U&'\+00FFFD' || '%')
    union all select '발신인 이름이 빈 쪽' where exists (
      select 1 from volume_pages where author_name is null or author_name = '')
    union all select '한 권 두 색인 발신인' where exists (
      select 1 from (select volume_id, author_name from volume_pages
                     group by volume_id, author_name
                     having count(distinct paper_color) > 1) x)
    union all select '쪽 번호가 겹치거나 빠진 권' where exists (
      select 1 from volumes v where v.deleted_at is null
        and (select count(distinct p.ord) from volume_pages p where p.volume_id = v.id)
            <> v.page_count)
    union all select '정원 4명을 넘은 전보함' where exists (
      select 1 from (select box_id from box_members group by box_id having count(*) > 4) x)
  ) t;

  if add is not null then
    raise exception E'운영 데이터가 앞뒤가 맞지 않습니다: %'
      '\n       위 표에서 0 이 아닌 항목을 보세요. 값은 찍지 않습니다.', add;
  end if;
  raise notice '앞뒤가 맞습니다 — 어긋난 항목 없음';
end $$;

rollback;
