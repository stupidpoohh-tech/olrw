-- ═══════════════════════════════════════════════════════════════════════════
-- OLRW — 봉인 우회 차단 (P0-2)
--
-- 무엇이 뚫려 있었나.
--   `boxes` 에는 멤버 UPDATE 정책이 열려 있다. 전보함 이름을 멤버가 바꿀 수
--   있어야 해서다(SettingsModal). 그래서 **무엇을 바꿀 수 있는지는 전적으로
--   `boxes_guard()` 트리거가 정한다.**
--
--   그 트리거가 보호할 컬럼을 하나씩 **열거**하고 있었고, 거기서 `sealed` 가
--   빠져 있었다. 결과는 절대 규칙(D1)의 정면 우회다 — 멤버가 UI 를 거치지 않고
--   Data API 로 `PATCH /boxes?id=eq.…` `{"sealed": false}` 한 번만 보내면
--   `can_read_body()` 가 곧바로 통과하고, 아직 만나지도 않은 남의 이번 권 전보
--   본문이 전부 열렸다. 봉투도 전문을 드러냈다.
--
-- 어떻게 막는가. 두 겹으로 막는다.
--
--   1. **권한 계층** — `update` 를 컬럼 단위로 좁힌다. 사용자가 직접 쓸 수 있는
--      것은 `boxes.name` 하나뿐이다. 다른 컬럼은 요청이 트리거에 닿기도 전에
--      권한에서 끊긴다.
--   2. **트리거 계층** — 열거를 뒤집어 **화이트리스트**로 만든다. "이것만 바꿀
--      수 있다" 로 적으면 컬럼이 늘어나도 구멍이 저절로 생기지 않는다. 이번
--      결함이 정확히 열거를 빠뜨려서 생겼다.
--
-- 봉인 해제 경로는 그대로다. `begin_reading()` 과 `close_volume()` 은
-- `security definer` 로 돌고 `is_internal()` 표식을 세우므로 두 계층을 모두
-- 정상적으로 지난다. confirm → 함께 읽기 → customize → binding → done 흐름은
-- 한 줄도 바뀌지 않는다.
--
-- 검증: neon/tests/rls_test.sql 의 [P0-2] 케이스들.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══ 1. 권한 — 사용자가 직접 쓸 수 있는 컬럼을 이름 하나로 좁힌다 ═════════
--
-- security definer 함수(create_box · join_box · begin_reading · close_volume ·
-- leave_box)는 함수 소유자 권한으로 돌므로 이 제한을 받지 않는다.

revoke update on boxes from anonymous, authenticated;
grant  update (name) on boxes to authenticated;

-- 같은 이유로 나머지 표도 좁힌다. 열어 두던 것과 실제로 필요한 것이 어긋나
-- 있으면 언젠가 같은 일이 벌어진다.
--   box_members  용지색·타자기는 개인 설정이라 본인이 바꾼다
--   telegrams    회수(소프트 삭제)만 — 본문·권·발신인은 발신하면 끝이다
--   profiles     표시 이름만
revoke update on box_members from anonymous, authenticated;
grant  update (paper_color, type_color) on box_members to authenticated;

revoke update on telegrams from anonymous, authenticated;
grant  update (deleted_at) on telegrams to authenticated;

revoke update on profiles from anonymous, authenticated;
grant  update (display_name) on profiles to authenticated;

-- ═══ 2. 트리거 — 열거를 화이트리스트로 뒤집는다 ═══════════════════════════
--
-- `to_jsonb(new) - '허용 컬럼'` 끼리 비교하면 **허용한 것 말고 무엇이든** 달라진
-- 순간 걸린다. 앞으로 컬럼이 늘어도 자동으로 보호되고, 열어 주려면 여기에
-- 명시적으로 적어야 한다.

create or replace function boxes_guard() returns trigger
language plpgsql as $$
begin
  if is_internal() then return new; end if;
  -- 사용자가 직접 바꿀 수 있는 것은 이름 하나뿐이다.
  -- sealed · reading_started_at · current_vol · invite_code · owner_id ·
  -- created_at · id 는 전부 서버 함수만 건드린다.
  if to_jsonb(new) - 'name' is distinct from to_jsonb(old) - 'name' then
    raise exception '이 항목은 직접 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function members_guard() returns trigger
language plpgsql as $$
begin
  if is_internal() then return new; end if;
  -- 용지색과 타자기만 본인이 바꾼다. box_id · user_id · joined_at 은 참여
  -- 기록이고, 그것은 join_box() 와 leave_box() 만 쓴다.
  if to_jsonb(new) - 'paper_color' - 'type_color'
     is distinct from to_jsonb(old) - 'paper_color' - 'type_color' then
    raise exception '이 항목은 직접 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function telegrams_guard() returns trigger
language plpgsql as $$
begin
  if is_internal() then return new; end if;
  -- 전보는 발신하면 끝이다. 바꿀 수 있는 것은 회수(deleted_at) 하나뿐이고,
  -- 그것도 되돌릴 수 없다 (S9: 소프트 삭제를 실제로 쓴다).
  if to_jsonb(new) - 'deleted_at' is distinct from to_jsonb(old) - 'deleted_at' then
    raise exception '전보는 수정할 수 없습니다.' using errcode = 'P0001';
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception '삭제한 전보는 되돌릴 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- profiles 에는 트리거가 없었다. 이름만 바꿀 수 있어야 하는데 created_at 은
-- 열려 있었다 — 권한 상승은 아니지만 같은 종류의 빈틈이다.
create or replace function profiles_guard() returns trigger
language plpgsql as $$
begin
  if is_internal() then return new; end if;
  if to_jsonb(new) - 'display_name' is distinct from to_jsonb(old) - 'display_name' then
    raise exception '이 항목은 직접 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_t on profiles;
create trigger profiles_guard_t before update on profiles
  for each row execute function profiles_guard();

commit;
