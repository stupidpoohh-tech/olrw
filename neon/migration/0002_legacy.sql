-- ═══════════════════════════════════════════════════════════════════════════
-- OLRW — 옛 전보함 이관 (Firestore → Neon)
--
--   원본: neon/migration/legacy-export.json (2026-09-02T02:35:46.411Z 에 꺼냄)
--   생성: node neon/migration/build.mjs  ← 이 파일을 손으로 고치지 않는다
--   절차: docs/DATA-MIGRATION.md
--
--   전보함 4 · 참여 8 · 이번 권 전보 1
--   · 제본된 권 14 · 제본된 전보 117
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
--   Def.clar VOL.1
--   Def.clar VOL.2
--   Def.clar VOL.3
--   예쁘다 VOL.4
--   예쁘다 VOL.5
--   예쁘다 VOL.7
--   예쁘다 VOL.8
--   예쁘다 VOL.9
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ═══ 1. 사람 짝짓기 — 여기만 채운다 ═══════════════════════════════════════
--
-- 옛 파이어베이스 uid 와 새 Neon 계정 uuid 는 서로 남이다. 네 사람이 새 앱에서
-- 먼저 가입해야 하고, uuid 는 Neon 콘솔 → Tables → profiles 에서 받는다.
--
-- null 을 '…' 로 바꾼다. 하나라도 비면 아래에서 멈추고 누가 빠졌는지 알려준다.
--
-- 임시 테이블이 아니라 진짜 테이블이다 — 편집기가 문장을 따로 실행해도 살아
-- 있어야 한다. 맨 끝(§7)에서 지운다.

drop table if exists legacy_user;
create table legacy_user (
  legacy_uid text primary key,
  label      text not null,
  id         uuid
);

insert into legacy_user (legacy_uid, label, id) values
  ('2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada (stupidpoohh@gmail.com)', null), -- ← 여기에 uuid
  ('7CBIzZaGFMNHS9kvWeC9GFXPeRu2', '클레어',                       null), -- ← 여기에 uuid
  ('vzGQa9o4k9Nozrc4nQagIrMYKPt2', '에피',                         null), -- ← 여기에 uuid
  ('mIse6qtQ4OepJAzf5fl50b7M78x1', '이유경',                       null)  -- ← 여기에 uuid
;

do $$
declare v_missing text;
begin
  select string_agg(label, ', ') into v_missing from legacy_user where id is null;
  if v_missing is not null then
    raise exception E'아직 uuid 를 채우지 않았습니다: %'
      '\n       Neon 콘솔 → Tables → profiles 에서 받아 이 파일 §1 에 적으세요.', v_missing;
  end if;

  select string_agg(u.label, ', ') into v_missing
    from legacy_user u left join profiles p on p.id = u.id where p.id is null;
  if v_missing is not null then
    raise exception E'새 앱에 아직 프로필이 없습니다: %'
      '\n       네 사람이 모두 새 앱에서 가입을 마쳐야 합니다.', v_missing;
  end if;
end $$;

-- ═══ 2. 전보함 ════════════════════════════════════════════════════════════
-- 옛 coupleCode 를 새 초대 코드로 그대로 쓴다 — 네 사람이 외우고 있는 값이고,
-- 넷 다 새 형식(혼동 문자 I O 0 1 제외)에 맞는다.
-- 봉인은 기본값 그대로 true (D1). 권 번호의 구멍은 메꾸지 않는다.

insert into boxes (id, name, invite_code, owner_id, current_vol, sealed, created_at)
select t.id::uuid, t.name, t.code, u.id, t.vol, true, t.created_at::timestamptz
from (values
  ('d548f9a7-aa87-65a7-362d-99ff8486a2de', 'Def.clar', '3LMA-5J28', '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 4,  '2026-07-21T06:04:38.961Z'), -- Def.clar
  ('f20bd636-9b7a-f0dd-197a-2d3252f3f910', '예쁘다',   'VYSV-RY65', '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 10, '2026-05-26T00:37:56.992Z'), -- 예쁘다
  ('f79155b6-5285-c728-f14f-182514cae871', '931614',   '35NW-VCT7', '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 4,  '2026-07-21T06:12:21.961Z'), -- 931614
  ('217503a1-0675-fa6c-fbb7-2d694d8048f9', '희뜌다',   'Z3QL-S9WP', '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 3,  '2026-07-23T01:51:24.110Z')  -- 희뜌다
) as t(id, name, code, legacy_uid, vol, created_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ═══ 3. 참여자 ════════════════════════════════════════════════════════════
-- paper_color(용지색)는 공개 정보라 원본 그대로 둔다. type_color 는 타자기이고
-- 개인 설정이다 — 옛 색을 네 대 중 가까운 것으로 옮긴다 (D9). 앱에서 바꿀 수 있다.

insert into box_members (box_id, user_id, paper_color, type_color, joined_at)
select t.box_id::uuid, u.id, t.paper, t.type, t.joined_at::timestamptz
from (values
  ('d548f9a7-aa87-65a7-362d-99ff8486a2de', '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'powder', 'sugar', '2026-07-21T06:04:38.560Z'), -- Def.clar · Dada · 옛 violet
  ('d548f9a7-aa87-65a7-362d-99ff8486a2de', '7CBIzZaGFMNHS9kvWeC9GFXPeRu2', 'lilac',  'sugar', '2026-07-21T06:27:46.601Z'), -- Def.clar · 클레어 · 옛 violet
  ('d548f9a7-aa87-65a7-362d-99ff8486a2de', 'vzGQa9o4k9Nozrc4nQagIrMYKPt2', 'blush',  'moss',  '2026-07-21T09:10:25.951Z'), -- Def.clar · 에피 · 옛 green
  ('f20bd636-9b7a-f0dd-197a-2d3252f3f910', '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'powder', 'steel', '2026-07-21T06:07:15.290Z'), -- 예쁘다 · Dada · 옛 blue
  ('f20bd636-9b7a-f0dd-197a-2d3252f3f910', 'vzGQa9o4k9Nozrc4nQagIrMYKPt2', 'blush',  'moss',  '2026-07-21T09:11:11.834Z'), -- 예쁘다 · 에피 · 옛 green
  ('f79155b6-5285-c728-f14f-182514cae871', '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'powder', 'oak',   '2026-07-21T06:12:21.576Z'), -- 931614 · Dada · 옛 ochre
  ('f79155b6-5285-c728-f14f-182514cae871', 'mIse6qtQ4OepJAzf5fl50b7M78x1', 'ivory',  'moss',  '2026-07-23T01:40:37.041Z'), -- 931614 · 이유경 · 옛 teal
  ('217503a1-0675-fa6c-fbb7-2d694d8048f9', '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'powder', 'sugar', '2026-07-23T01:51:23.787Z')  -- 희뜌다 · Dada · 옛 rose
) as t(box_id, legacy_uid, paper, type, joined_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ═══ 4. 이번 권 전보 (아직 제본되지 않은 것) ══════════════════════════════

insert into telegrams (id, box_id, author_id, body, vol, created_at)
select t.id::uuid, t.box_id::uuid, u.id, t.body, t.vol, t.created_at::timestamptz
from (values
  ('9ec2888d-c529-bf12-6612-7cdd0e2f47cc', 'd548f9a7-aa87-65a7-362d-99ff8486a2de', '2SNxPK1lsnQA29bKrQr2xMJrjYB2', '방향성 여럿모임?', 4, '2026-08-11T04:17:52.197Z') -- Def.clar
) as t(id, box_id, legacy_uid, body, vol, created_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
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
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 'd548f9a7-aa87-65a7-362d-99ff8486a2de', 1, '',               'sage',     '2026-07-21 15:16:00+09', '2026-07-24 11:23:00+09', 14, '2026-07-25T05:32:36.062Z'), -- Def.clar VOL.1 · 옛 표지는 사진
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 'd548f9a7-aa87-65a7-362d-99ff8486a2de', 2, '',               'sage',     '2026-07-25 18:59:00+09', '2026-07-31 16:28:00+09', 11, '2026-08-01T07:02:07.296Z'), -- Def.clar VOL.2 · 옛 표지는 사진
  ('b641027e-01b4-596f-6819-352b6c16792c', 'd548f9a7-aa87-65a7-362d-99ff8486a2de', 3, '사진안찍엇다악', 'sage',     '2026-08-04 14:57:00+09', '2026-08-06 11:03:00+09', 9,  '2026-08-11T04:17:26.376Z'), -- Def.clar VOL.3 · 옛 표지는 사진
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 'f20bd636-9b7a-f0dd-197a-2d3252f3f910', 3, '',               'sage',     '2026-05-26 13:40:00+09', '2026-06-03 14:45:00+09', 24, '2026-06-03T06:38:59.711Z'), -- 예쁘다 VOL.3
  ('6c1aaa84-09a7-c8b3-9e52-1bc2efa239f1', 'f20bd636-9b7a-f0dd-197a-2d3252f3f910', 4, '',               'sage',     '2026-06-10 07:04:00+09', '2026-06-12 09:33:00+09', 5,  '2026-06-12T00:33:39.095Z'), -- 예쁘다 VOL.4 · 옛 표지는 사진
  ('a37acdf1-c112-743d-b437-bc1e75c7e464', 'f20bd636-9b7a-f0dd-197a-2d3252f3f910', 5, '',               'sage',     '2026-06-12 14:59:00+09', '2026-06-18 14:57:00+09', 7,  '2026-06-18T09:32:31.774Z'), -- 예쁘다 VOL.5 · 옛 표지는 사진
  ('7bd89b3d-dbb4-1de8-32b0-2b9d7c1a0292', 'f20bd636-9b7a-f0dd-197a-2d3252f3f910', 6, '상수',           'sage',     '2026-06-19 22:39:00+09', '2026-06-29 17:54:00+09', 8,  '2026-06-30T09:11:10.933Z'), -- 예쁘다 VOL.6
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 'f20bd636-9b7a-f0dd-197a-2d3252f3f910', 7, '',               'sage',     '2026-07-02 16:07:00+09', '2026-07-24 11:52:00+09', 20, '2026-07-25T04:49:28.099Z'), -- 예쁘다 VOL.7 · 옛 표지는 사진
  ('dfdf6125-c8d9-3392-6801-be6875af9abb', 'f20bd636-9b7a-f0dd-197a-2d3252f3f910', 8, '',               'sage',     '2026-07-27 16:34:00+09', '2026-08-30 20:43:00+09', 7,  '2026-08-30T11:44:04.779Z'), -- 예쁘다 VOL.8 · 옛 표지는 사진
  ('2be80488-dad2-2725-af07-a86db221a002', 'f20bd636-9b7a-f0dd-197a-2d3252f3f910', 9, '',               'sage',     '2026-08-31 17:05:00+09', '2026-09-01 17:29:00+09', 4,  '2026-09-01T12:10:13.540Z'), -- 예쁘다 VOL.9 · 옛 표지는 사진
  ('bfb385d0-729a-8c32-7ea3-b4a1f67a7c5b', 'f79155b6-5285-c728-f14f-182514cae871', 1, '',               'charcoal', '2026-07-21 15:35:00+09', '2026-07-24 10:42:00+09', 3,  '2026-07-24T01:42:16.374Z'), -- 931614 VOL.1
  ('af6b90d3-96c0-d1eb-a4d6-2faf9e139fd9', 'f79155b6-5285-c728-f14f-182514cae871', 3, '',               'navy',     '2026-08-04 12:20:00+09', '2026-08-04 12:20:00+09', 1,  '2026-08-04T03:20:34.188Z'), -- 931614 VOL.3
  ('af84defb-74f6-7740-12dd-0139ff29d935', '217503a1-0675-fa6c-fbb7-2d694d8048f9', 1, '',               'charcoal', '2026-07-23 10:52:00+09', '2026-08-07 23:23:00+09', 2,  '2026-08-07T14:23:48.895Z'), -- 희뜌다 VOL.1
  ('0990e17b-4d67-0465-6e34-1dc6c3b4f023', '217503a1-0675-fa6c-fbb7-2d694d8048f9', 2, '',               'charcoal', '2026-08-15 09:05:00+09', '2026-08-24 13:03:00+09', 2,  '2026-08-24T04:03:23.625Z')  -- 희뜌다 VOL.2
) as t(id, box_id, vol, title, cover, period_start, period_end, pages, closed_at)
on conflict do nothing;

-- ═══ 6. 제본된 전보 (스냅샷) ══════════════════════════════════════════════
-- 이름과 용지색은 제본 시점 값이다. 지금 프로필을 참조하지 않는다.
-- 'a' / 'b' 로만 적힌 더 옛 형식은 사람을 확정해 이름·용지색을 채웠다 —
-- 근거는 neon/migration/build.mjs 의 LEGACY_ALIAS 주석.

-- ── Def.clar VOL.1 · 14통 ──────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 1,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '머리 쓰다듬어줘',                    '2026-07-21 15:16:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 2,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '홍대 전주 확장 고민',                '2026-07-21 15:16:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 3,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '티켓발행 애니메이션 밤티야?',        '2026-07-21 15:16:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 4,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '전체 미감 색상 UI/UX 같은거',        '2026-07-21 15:16:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 5,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '티켓 미감에 힘을 써주이소',          '2026-07-21 15:16:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 6,  '7CBIzZaGFMNHS9kvWeC9GFXPeRu2', '클레어', 'lilac',  '이렇게 쓰면 등록되는 건가?',         '2026-07-21 15:30:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 7,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '서비스 정식 배포 언제부터?',         '2026-07-21 15:36:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 8,  'vzGQa9o4k9Nozrc4nQagIrMYKPt2', '에피',   'blush',  'completed!',                         '2026-07-21 18:10:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 9,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '배포 전 전체 점검 url 등',           '2026-07-22 10:17:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 10, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '큐레이션 추천의 기회',               '2026-07-22 10:24:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 11, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '사우나 웰니스',                      '2026-07-23 18:09:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 12, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '만트...라 프리티걸프리티걸..',       '2026-07-23 18:15:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 13, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '있으면 좋은거 말고 없으면 불편한거', '2026-07-24 11:23:00+09'),
  ('4a4df8c1-620c-c64f-47b9-c074bfe4016d', 14, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '불편해서 에라이만들자',              '2026-07-24 11:23:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── Def.clar VOL.2 · 11통 ──────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 1,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '쩝쩝박사 논문디펜스 쩝쩝력',                                  '2026-07-25 18:59:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 2,  '7CBIzZaGFMNHS9kvWeC9GFXPeRu2', '클레어', 'lilac',  '한강 수영장은 어땠나요 공주들',                               '2026-07-25 22:48:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 3,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '대학교 메타버스느낌',                                         '2026-07-27 08:17:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 4,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '브랜드컬러 시스템',                                           '2026-07-31 13:03:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 5,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '티켓 애니메이션',                                             '2026-07-31 13:03:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 6,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '티켓 디자인',                                                 '2026-07-31 13:03:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 7,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '홈화면 팝업 담기배치 UI',                                     '2026-07-31 13:03:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 8,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '카카오연동정책',                                              '2026-07-31 13:03:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 9,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '회원정책 점검, 프로세스 ui/ux 해보며 재점검, 배포전최종점검', '2026-07-31 13:09:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 10, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '마케팅 기획',                                                 '2026-07-31 13:09:00+09'),
  ('e1501f61-6d9b-29cf-0e6e-f0fd9d3b0de9', 11, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada',   'powder', '일단 머리쓰다듬어주고시작',                                   '2026-07-31 16:28:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── Def.clar VOL.3 · 9통 ───────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('b641027e-01b4-596f-6819-352b6c16792c', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '큐레이션!!!',                                                                          '2026-08-04 14:57:00+09'),
  ('b641027e-01b4-596f-6819-352b6c16792c', 2, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '티켓 같이',                                                                            '2026-08-04 16:20:00+09'),
  ('b641027e-01b4-596f-6819-352b6c16792c', 3, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '팝업 특전..?',                                                                         '2026-08-04 16:20:00+09'),
  ('b641027e-01b4-596f-6819-352b6c16792c', 4, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '마케팅 고민',                                                                          '2026-08-04 16:20:00+09'),
  ('b641027e-01b4-596f-6819-352b6c16792c', 5, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '배포!!!!!',                                                                            '2026-08-04 16:21:00+09'),
  ('b641027e-01b4-596f-6819-352b6c16792c', 6, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '머리쓰다듬!!!!',                                                                       '2026-08-04 16:22:00+09'),
  ('b641027e-01b4-596f-6819-352b6c16792c', 7, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '그전에 전체점검',                                                                      '2026-08-04 16:22:00+09'),
  ('b641027e-01b4-596f-6819-352b6c16792c', 8, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '냠냠대학:단과대, 입학, 학사시스템, 선서, 입학장, 강의, 과제, 밈콘텐츠 바이럴, 웹기획', '2026-08-04 16:31:00+09'),
  ('b641027e-01b4-596f-6819-352b6c16792c', 9, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '티켓애니메이션',                                                                       '2026-08-06 11:03:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 예쁘다 VOL.3 · 24통 ────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 1,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '보이나요 나의 마음이 헤헤 STOP',                      '2026-05-26 13:40:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 2,  'vzGQa9o4k9Nozrc4nQagIrMYKPt2', '에피', 'blush',  '돼따!!!',                                             '2026-05-26 15:06:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 3,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '펜팔 N의 경험 STOP',                                  '2026-05-26 16:37:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 4,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '황소 미역국 STOP',                                    '2026-05-26 16:38:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 5,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '담배꽁초를 버리지 맙시다 그리고 맡은 바 일하기 STOP', '2026-05-26 16:39:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 6,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '주하 자전거 STOP',                                    '2026-05-26 16:39:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 7,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', 'melting down. STOP',                                  '2026-05-26 16:44:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 8,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', 'John Parkhain STOP',                                  '2026-05-26 16:45:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 9,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '나를 브랜딩/기획? 서사? 경험? 콘텐츠? STOP',          '2026-05-26 16:45:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 10, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '상품은 3D STOP',                                      '2026-05-26 16:46:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 11, 'vzGQa9o4k9Nozrc4nQagIrMYKPt2', '에피', 'blush',  '하도싶은 말을 저으면 되는 걸가요',                    '2026-05-26 18:55:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 12, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '쥭지고않꼬 모동숲 STOP',                              '2026-05-27 10:36:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 13, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '카카오마켓 1위, 언젠가 STOP',                         '2026-05-28 13:31:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 14, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '셋로그 삼총사 STOP',                                  '2026-05-28 13:31:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 15, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', 'About 이직 엉덩이 STOP',                              '2026-06-01 14:05:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 16, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '법적 대응 재수 STOP',                                 '2026-06-01 14:33:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 17, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '모동숲 주민 STOP',                                    '2026-06-01 14:33:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 18, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '퇴직금이라는 것 STOP',                                '2026-06-01 14:50:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 19, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '알림 0 vs 몇천 STOP',                                 '2026-06-01 15:56:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 20, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '찌질의 역사 STOP',                                    '2026-06-01 16:07:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 21, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '4출.. STOP',                                          '2026-06-01 19:38:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 22, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '토스미니앱?! STOP',                                   '2026-06-02 14:06:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 23, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '당신과 함께라면 지옥불이라도 STOP',                   '2026-06-02 16:34:00+09'), -- 옛 형식
  ('ca588ddc-ff87-f51e-8830-147d25675daf', 24, 'vzGQa9o4k9Nozrc4nQagIrMYKPt2', '에피', 'blush',  '다 들어줄게!!! 기다려!!!',                            '2026-06-03 14:45:00+09')  -- 옛 형식
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 예쁘다 VOL.4 · 5통 ─────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('6c1aaa84-09a7-c8b3-9e52-1bc2efa239f1', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '성세천하2!!!!!',         '2026-06-10 07:04:00+09'), -- 옛 형식
  ('6c1aaa84-09a7-c8b3-9e52-1bc2efa239f1', 2, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '다다리스닝 헤헤',        '2026-06-10 09:02:00+09'), -- 옛 형식
  ('6c1aaa84-09a7-c8b3-9e52-1bc2efa239f1', 3, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '유갱 하닉!!! 과 찌찔이', '2026-06-10 15:42:00+09'), -- 옛 형식
  ('6c1aaa84-09a7-c8b3-9e52-1bc2efa239f1', 4, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '취업선물',               '2026-06-10 21:45:00+09'), -- 옛 형식
  ('6c1aaa84-09a7-c8b3-9e52-1bc2efa239f1', 5, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '현지아프지마',           '2026-06-12 09:33:00+09')  -- 옛 형식
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 예쁘다 VOL.5 · 7통 ─────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('a37acdf1-c112-743d-b437-bc1e75c7e464', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '대충 안됐다',   '2026-06-12 14:59:00+09'), -- 옛 형식
  ('a37acdf1-c112-743d-b437-bc1e75c7e464', 2, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '조선의4번타자', '2026-06-16 13:05:00+09'), -- 옛 형식
  ('a37acdf1-c112-743d-b437-bc1e75c7e464', 3, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '공모전헌터',    '2026-06-17 12:37:00+09'), -- 옛 형식
  ('a37acdf1-c112-743d-b437-bc1e75c7e464', 4, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '연차 단한개',   '2026-06-17 12:37:00+09'), -- 옛 형식
  ('a37acdf1-c112-743d-b437-bc1e75c7e464', 5, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '다슬기즙',      '2026-06-17 12:37:00+09'), -- 옛 형식
  ('a37acdf1-c112-743d-b437-bc1e75c7e464', 6, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '사주야호',      '2026-06-17 17:53:00+09'), -- 옛 형식
  ('a37acdf1-c112-743d-b437-bc1e75c7e464', 7, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '낭만백수달',    '2026-06-18 14:57:00+09')  -- 옛 형식
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 예쁘다 VOL.6 · 8통 ─────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('7bd89b3d-dbb4-1de8-32b0-2b9d7c1a0292', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '쮸베룩',                                                 '2026-06-19 22:39:00+09'), -- 옛 형식
  ('7bd89b3d-dbb4-1de8-32b0-2b9d7c1a0292', 2, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '밤티 흑흑',                                              '2026-06-22 17:19:00+09'), -- 옛 형식
  ('7bd89b3d-dbb4-1de8-32b0-2b9d7c1a0292', 3, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', 'After all, what matters is the people who are with us.', '2026-06-22 20:08:00+09'), -- 옛 형식
  ('7bd89b3d-dbb4-1de8-32b0-2b9d7c1a0292', 4, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '반성도 버릇이다',                                        '2026-06-24 11:00:00+09'), -- 옛 형식
  ('7bd89b3d-dbb4-1de8-32b0-2b9d7c1a0292', 5, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '인바디 인종',                                            '2026-06-24 11:00:00+09'), -- 옛 형식
  ('7bd89b3d-dbb4-1de8-32b0-2b9d7c1a0292', 6, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '서있는사람',                                             '2026-06-26 12:45:00+09'), -- 옛 형식
  ('7bd89b3d-dbb4-1de8-32b0-2b9d7c1a0292', 7, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '스피또 계약직',                                          '2026-06-29 15:00:00+09'), -- 옛 형식
  ('7bd89b3d-dbb4-1de8-32b0-2b9d7c1a0292', 8, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', 'pms',                                                    '2026-06-29 17:54:00+09')  -- 옛 형식
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 예쁘다 VOL.7 · 20통 ────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 1,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '성과와 근태',                                '2026-07-02 16:07:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 2,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '내향수달',                                   '2026-07-02 16:07:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 3,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '또괜히청하마실뻔',                           '2026-07-03 08:49:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 4,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '욕심없음',                                   '2026-07-03 08:49:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 5,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '리모트워크',                                 '2026-07-03 16:40:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 6,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '투덜의 농도',                                '2026-07-06 16:42:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 7,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', 'AI랑 바보랑 규제권장',                       '2026-07-06 17:43:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 8,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '상하이 치안 -9',                             '2026-07-20 14:50:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 9,  '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '현대미술 민화 카디비, 어떤 대척점',          '2026-07-20 14:50:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 10, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '여수외래해충은 죽은척한다',                  '2026-07-20 14:50:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 11, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '결제화면 12월 어떻게?',                      '2026-07-20 14:50:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 12, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '제네시스 찐따의사 선크림에도 불구하고 유전', '2026-07-20 14:50:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 13, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '영관 말타는 사진',                           '2026-07-20 15:10:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 14, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '정정: 다색캥거루잎벌레',                     '2026-07-20 17:35:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 15, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '에고',                                       '2026-07-21 13:20:00+09'), -- 옛 형식
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 16, 'vzGQa9o4k9Nozrc4nQagIrMYKPt2', '에피', 'blush',  '나 근데 잼얘있어',                           '2026-07-21 18:11:00+09'),
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 17, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '스팀..입사의꿈',                             '2026-07-23 18:14:00+09'),
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 18, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '명예영국인..',                               '2026-07-23 20:57:00+09'),
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 19, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '범성 분한 눈물',                             '2026-07-24 10:34:00+09'),
  ('30004ebd-b2b4-4fe9-6451-a7b25497bc7b', 20, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '웹팩스 팔자 넣자',                           '2026-07-24 11:52:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 예쁘다 VOL.8 · 7통 ─────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('dfdf6125-c8d9-3392-6801-be6875af9abb', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '관리화면 취미... 재심사...',                                '2026-07-27 16:34:00+09'),
  ('dfdf6125-c8d9-3392-6801-be6875af9abb', 2, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '두명의 재심사.. 반전의 반전같이..',                         '2026-07-28 11:09:00+09'),
  ('dfdf6125-c8d9-3392-6801-be6875af9abb', 3, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '신도리코의 젠몬 크리에이터와 진짜 젠몬크리에이터.. 자문..', '2026-07-31 13:04:00+09'),
  ('dfdf6125-c8d9-3392-6801-be6875af9abb', 4, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '바보캘린더를 보면 천재가 된거같아 헤헤',                    '2026-08-07 11:59:00+09'),
  ('dfdf6125-c8d9-3392-6801-be6875af9abb', 5, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '언제나 안믿음',                                             '2026-08-11 14:52:00+09'),
  ('dfdf6125-c8d9-3392-6801-be6875af9abb', 6, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '내 꿈: 사우나 마련',                                        '2026-08-19 09:16:00+09'),
  ('dfdf6125-c8d9-3392-6801-be6875af9abb', 7, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '모난돌',                                                    '2026-08-30 20:43:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 예쁘다 VOL.9 · 4통 ─────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('2be80488-dad2-2725-af07-a86db221a002', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '팀장님이 막아줄거다', '2026-08-31 17:05:00+09'),
  ('2be80488-dad2-2725-af07-a86db221a002', 2, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '준혁이의 배경화면..', '2026-09-01 16:42:00+09'),
  ('2be80488-dad2-2725-af07-a86db221a002', 3, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '36살 럽스타',         '2026-09-01 16:42:00+09'),
  ('2be80488-dad2-2725-af07-a86db221a002', 4, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '영상 서너개',         '2026-09-01 17:29:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 931614 VOL.1 · 3통 ─────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('bfb385d0-729a-8c32-7ea3-b4a1f67a7c5b', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '와주셔서 감사합니둥', '2026-07-21 15:35:00+09'),
  ('bfb385d0-729a-8c32-7ea3-b4a1f67a7c5b', 2, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '서있는 사람들',       '2026-07-21 17:40:00+09'),
  ('bfb385d0-729a-8c32-7ea3-b4a1f67a7c5b', 3, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '예시',                '2026-07-24 10:42:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 931614 VOL.3 · 1통 ─────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('af6b90d3-96c0-d1eb-a4d6-2faf9e139fd9', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '류롤ㄹ츄류률', '2026-08-04 12:20:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 희뜌다 VOL.1 · 2통 ─────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('af84defb-74f6-7740-12dd-0139ff29d935', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '히히 웰컴 STOP', '2026-07-23 10:52:00+09'),
  ('af84defb-74f6-7740-12dd-0139ff29d935', 2, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '이말해야징',     '2026-08-07 23:23:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ── 희뜌다 VOL.2 · 2통 ─────────────────────────────────────────────────────
insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)
select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz
from (values
  ('0990e17b-4d67-0465-6e34-1dc6c3b4f023', 1, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '뜌',   '2026-08-15 09:05:00+09'),
  ('0990e17b-4d67-0465-6e34-1dc6c3b4f023', 2, '2SNxPK1lsnQA29bKrQr2xMJrjYB2', 'Dada', 'powder', '잼얘', '2026-08-24 13:03:00+09')
) as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)
join legacy_user u on u.legacy_uid = t.legacy_uid
on conflict do nothing;

-- ═══ 7. 결산 ══════════════════════════════════════════════════════════════
-- 넣은 만큼 들어갔는지 세어 본다. 하나라도 모자라면 여기서 통째로 되돌린다.

do $$
declare
  v_box int; v_mem int; v_tg int; v_vol int; v_page int;
  v_mine  uuid[] := array(select id from legacy_user);
  v_boxes uuid[];
begin
  v_boxes := array(select distinct box_id from box_members where user_id = any (v_mine));
  v_box   := coalesce(array_length(v_boxes, 1), 0);
  select count(*) into v_mem  from box_members  where user_id   = any (v_mine);
  select count(*) into v_tg   from telegrams    where author_id = any (v_mine);
  select count(*) into v_vol  from volumes      where box_id    = any (v_boxes);
  select count(*) into v_page from volume_pages where author_id = any (v_mine);

  raise notice '전보함 % · 참여 % · 이번 권 전보 % · 제본된 권 % · 제본된 전보 %',
    v_box, v_mem, v_tg, v_vol, v_page;

  if v_box < 4 or v_mem < 8 or v_tg < 1 or v_vol < 14 or v_page < 117 then
    raise exception '들어간 행이 모자랍니다. 기대: 전보함 4 · 참여 8 · 전보 1 · 권 14 · 쪽 117';
  end if;
end $$;

drop table legacy_user;

commit;
