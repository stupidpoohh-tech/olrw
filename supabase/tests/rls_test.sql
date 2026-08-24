-- ═══════════════════════════════════════════════════════════════════════════
-- RLS · 서버 함수 검증
--
-- 각 케이스는 docs/AUDIT.md 의 결함 번호(S…)나 docs/decisions.md 의
-- 결정 번호(D…)와 연결된다. 기대와 다르면 FAIL 을 출력한다.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP off
\pset pager off
\set QUIET on
\timing off

create or replace function ok(label text, cond boolean) returns void
language plpgsql as $$
begin
  raise notice '%  %', case when cond then 'PASS' else 'FAIL' end, label;
  if not cond then
    perform set_config('olrw.failed', 'yes', false);
  end if;
end $$;

-- 예외가 나야 정상인 문장을 감싼다.
create or replace function denied(label text, stmt text) returns void
language plpgsql as $$
begin
  execute stmt;
  perform ok(label || ' → 거부되어야 하는데 통과함', false);
exception when others then
  perform ok(label, true);
end $$;

-- ── 사용자 5명 (마지막은 전보함 밖의 침입자) ──────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','a@x','{"display_name":"나"}'),
 ('22222222-2222-2222-2222-222222222222','b@x','{"display_name":"민서"}'),
 ('33333333-3333-3333-3333-333333333333','c@x','{"display_name":"재이"}'),
 ('44444444-4444-4444-4444-444444444444','d@x','{"display_name":"현"}'),
 ('99999999-9999-9999-9999-999999999999','e@x','{"display_name":"침입자"}');

\echo ''
\echo '━━━ 가입 · 생성 · 참여 ━━━'
select ok('가입 트리거가 프로필을 만든다', (select count(*) from profiles) = 5);

set role authenticated;
select as_user('11111111-1111-1111-1111-111111111111');
select box_id as box, invite_code as code from create_box('퇴근길 전보함','ivory','steel', true)
\gset
select ok('[S1] ABCD-2345 형식 초대 코드가 체크를 통과한다',
          :'code' ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$');

select as_user('22222222-2222-2222-2222-222222222222');
select ok('하이픈 없는 코드로 참여된다',
          (select box_name from join_box(replace(:'code','-',''),'blush','steel')) = '퇴근길 전보함');
select as_user('33333333-3333-3333-3333-333333333333');
select ok('소문자 코드로 참여된다',
          (select box_name from join_box(lower(:'code'),'powder','steel')) = '퇴근길 전보함');

-- 색은 정보다. 겹치면 발신인을 색으로 읽을 수 없다.
select as_user('44444444-4444-4444-4444-444444444444');
select ok('이미 쓰이는 용지색을 고르면 남은 색으로 돌려준다',
          (select box_name from join_box(:'code','ivory','steel')) is not null);
reset role;
select ok('한 전보함 안에서 용지색이 겹치지 않는다',
          (select count(distinct paper_color) from box_members) = 4);
select ok('빈 색 중 목록 순서로 앞선 것을 준다 (ivory 요청 → sage)',
          (select paper_color from box_members
           where user_id = '44444444-4444-4444-4444-444444444444') = 'sage');
set role authenticated;
select as_user('99999999-9999-9999-9999-999999999999');
select denied('정원 4명 상한이 5번째를 막는다',
              format('select join_box(%L,%L,%L)', :'code','sage','oak'));

\echo ''
\echo '━━━ 침입 차단 ━━━'
select denied('[S2] box_id를 알아도 직접 멤버가 될 수 없다',
  format('insert into box_members values (%L,%L,%L,%L)',
         :'box','99999999-9999-9999-9999-999999999999','sage','oak'));
select ok('[S2] 비멤버에게 전보함이 보이지 않는다', (select count(*) from boxes) = 0);

\echo ''
\echo '━━━ 타전 ━━━'
select as_user('11111111-1111-1111-1111-111111111111');
insert into telegrams (box_id, author_id, body, vol)
  values (:'box','11111111-1111-1111-1111-111111111111','고양이가 따라옴 STOP',1);
select as_user('22222222-2222-2222-2222-222222222222');
insert into telegrams (box_id, author_id, body, vol) values
  (:'box','22222222-2222-2222-2222-222222222222','떡볶이 냄새에 발이 멈춤 STOP',1),
  (:'box','22222222-2222-2222-2222-222222222222','새 향수가 실패 STOP',1);

select denied('[S5] 남의 이름으로 타전할 수 없다',
  format('insert into telegrams (box_id,author_id,body,vol) values (%L,%L,%L,1)',
         :'box','11111111-1111-1111-1111-111111111111','위조 STOP'));
select denied('[S5] 전보를 다른 권으로 옮길 수 없다',
  'update telegrams set vol = 99 where author_id = ''22222222-2222-2222-2222-222222222222''');
select denied('[S6] 100자를 넘는 전보는 거부된다',
  format('insert into telegrams (box_id,author_id,body,vol) values (%L,%L,%L,1)',
         :'box','22222222-2222-2222-2222-222222222222', repeat('가',101)));

\echo ''
\echo '━━━ 봉인 (D1) ━━━'
select as_user('11111111-1111-1111-1111-111111111111');
select ok('[D1] 봉인 중에는 남의 전보 행이 보이지 않는다',
          (select count(*) from telegrams) = 1);
select ok('[D1] 봉투는 3건 다 보인다',
          (select count(*) from telegram_envelopes) = 3);
select ok('[D1] 봉인된 봉투의 본문은 null이다',
          (select count(*) from telegram_envelopes where not unsealed and body is null) = 2);
select ok('[D1] 봉투가 분량은 알려준다',
          (select count(*) from telegram_envelopes where length_bucket in ('short','medium','long')) = 3);
select denied('[D1] 봉인을 직접 풀 수 없다',
  format('update boxes set reading_started_at = now() where id = %L', :'box'));

\echo ''
\echo '━━━ 함께 읽기 (D2) ━━━'
select ok('[D2] begin_reading이 봉인을 푼다', begin_reading(:'box') is not null);
select ok('[D2] 봉인이 풀리면 전문이 보인다', (select count(*) from telegrams) = 3);
select as_user('33333333-3333-3333-3333-333333333333');
select ok('[D4] 다른 멤버에게도 즉시 열린다 (혼자 마감의 완충)',
          (select count(*) from telegrams) = 3);

\echo ''
\echo '━━━ 제본 ━━━'
select denied('[S3] 멤버가 과거 책을 위조할 수 없다',
  format('insert into volumes (box_id,vol,period_start,period_end) values (%L,77,now(),now())', :'box'));

select as_user('22222222-2222-2222-2222-222222222222');
select close_volume(:'box','봄날의 출퇴근','color','burgundy',true) as vid \gset
select ok('제본된 권이 생긴다', (select count(*) from volumes where id = :'vid') = 1);
select ok('페이지 수가 맞다', (select page_count from volumes where id = :'vid') = 3);
select ok('[D2] 함께 읽기 여부가 기록된다', (select read_together from volumes where id = :'vid'));
select ok('기간이 전보 시각에서 산출된다',
          (select period_end >= period_start from volumes where id = :'vid'));
select ok('페이지가 발신 순서대로 쌓인다',
          (select array_agg(author_name order by ord) from volume_pages where volume_id = :'vid')
          = array['나','민서','민서']);
select ok('다음 권이 열린다', (select current_vol from boxes where id = :'box') = 2);
select ok('[D1] 다음 권은 다시 봉인된다',
          (select reading_started_at is null from boxes where id = :'box'));
select ok('[S9] 제본된 전보는 읽기 경로에서 사라진다',
          (select count(*) from telegram_envelopes) = 0);
reset role;
select ok('[S9] 그러나 파기되지 않고 소프트 삭제로 남는다',
          (select count(*) from telegrams where deleted_at is not null) = 3);
set role authenticated;
select as_user('22222222-2222-2222-2222-222222222222');
select denied('전보 0건 마감은 조용히 실패하지 않고 막는다',
  format('select close_volume(%L,%L,%L,%L,false)', :'box','빈 권','color','sage'));

\echo ''
\echo '━━━ 스냅샷 불변성 (스펙 §7-1) ━━━'
reset role;
update profiles    set display_name = '개명함' where id = '22222222-2222-2222-2222-222222222222';
update box_members set paper_color  = 'mist'   where user_id = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select as_user('11111111-1111-1111-1111-111111111111');
select ok('이름을 바꿔도 과거 책의 이름은 그대로다',
          (select count(*) from volume_pages where author_name = '민서') = 2);
select ok('용지색을 바꿔도 과거 책의 색은 그대로다',
          (select count(*) from volume_pages where paper_color = 'blush') = 2);

\echo ''
\echo '━━━ 불변 컬럼 잠금 (S5) ━━━'
select denied('[S5] 소유권을 임의로 넘길 수 없다',
  format('update boxes set owner_id = %L where id = %L','99999999-9999-9999-9999-999999999999',:'box'));
select denied('[S5] 초대 코드를 바꿀 수 없다',
  format('update boxes set invite_code = ''AAAA-BBBB'' where id = %L', :'box'));
select denied('[S5] 권 번호를 임의로 올릴 수 없다',
  format('update boxes set current_vol = 99 where id = %L', :'box'));
update boxes set name = '이름 바꿈' where id = :'box';
select ok('멤버는 전보함 이름을 바꿀 수 있다', (select name from boxes where id = :'box') = '이름 바꿈');
update box_members set paper_color = 'lilac' where user_id = '11111111-1111-1111-1111-111111111111';
select ok('내 색은 바꿀 수 있다',
  (select paper_color from box_members where user_id = '11111111-1111-1111-1111-111111111111') = 'lilac');
update box_members set paper_color = 'clay' where user_id = '33333333-3333-3333-3333-333333333333';
select ok('남의 색은 바꿀 수 없다',
  (select paper_color from box_members where user_id = '33333333-3333-3333-3333-333333333333') = 'powder');

\echo ''
\echo '━━━ 소프트 삭제 (S9) ━━━'
select as_user('33333333-3333-3333-3333-333333333333');
insert into telegrams (box_id, author_id, body, vol)
  values (:'box','33333333-3333-3333-3333-333333333333','회수 테스트 STOP',2);
update telegrams set deleted_at = now()
  where author_id = '33333333-3333-3333-3333-333333333333' and deleted_at is null;
select ok('[S9] 회수한 전보는 내 목록에서도 사라진다',
  (select count(*) from telegram_envelopes where vol = 2) = 0);
reset role;
select ok('[S9] 그러나 디스크에는 남아 있다',
  (select count(*) from telegrams where deleted_at is not null) = 4);
set role authenticated;
select as_user('33333333-3333-3333-3333-333333333333');
select denied('[S9] 회수한 전보를 되살릴 수 없다',
  'update telegrams set deleted_at = null');

-- 회수한 전보가 남에게 보이면 안 된다
select as_user('22222222-2222-2222-2222-222222222222');
select ok('[S9] 남이 회수한 전보는 행 자체가 보이지 않는다',
  (select count(*) from telegrams where vol = 2) = 0);

\echo ''
\echo '━━━ 소유자 이양 (S8) ━━━'
select as_user('11111111-1111-1111-1111-111111111111');
select leave_box(:'box');
reset role;
select ok('[S8] 방장이 나가면 다음 참여자에게 이양된다',
  (select p.display_name from boxes b join profiles p on p.id = b.owner_id where b.id = :'box') = '개명함');
select ok('[S8] 남은 인원이 맞다',
  (select count(*) from box_members where box_id = :'box') = 3);

\echo ''
\echo '━━━ 시도 제한 (S10) ━━━'
set role authenticated;
select as_user('99999999-9999-9999-9999-999999999999');
do $$
declare i int; begin
  for i in 1..9 loop
    begin perform join_box('ZZZZ-ZZZZ','sage','oak'); exception when others then null; end;
  end loop;
end $$;
select denied('[S10] 시간당 10회를 넘는 코드 시도는 막힌다',
  'select join_box(''ZZZZ-ZZZZ'',''sage'',''oak'')');

\echo ''
reset role;
select case when current_setting('olrw.failed', true) = 'yes'
            then '━━━ 실패한 케이스가 있습니다 ━━━'
            else '━━━ 전부 통과 ━━━' end as result;
