#!/usr/bin/env node
/**
 * legacy-export.json → 0002_legacy.sql
 *
 * 손으로 117줄을 옮겨 적지 않는다. 원본이 바뀌거나 아래 짝짓기 값이 바뀌면
 * 이 스크립트를 다시 돌려 SQL 을 새로 뽑는다.
 *
 *   node neon/migration/build.mjs
 *
 * 옛 uid ↔ 새 uuid 짝짓기는 여기서 하지 않는다. 생성된 SQL 맨 위 한 곳에
 * 빈칸으로 남고, 사람이 Neon 콘솔에서 받아 채운다 (docs/DATA-MIGRATION.md §1).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'legacy-export.json');
const OUT = join(HERE, '0002_legacy.sql');

/* ── 짝짓기 값 ─────────────────────────────────────────────────────────────
   uuid 만 사람이 채운다. 나머지 대응은 옛 앱과 새 앱의 어휘가 달라 생긴 것이고,
   근거는 각 표 위에 적었다. */

/**
 * **옮길 전보함.** 여기 없는 것은 SQL 에 들어가지 않는다.
 *
 * 원본에는 넷이 있지만 둘만 옮기기로 했다 (사용자 결정). 나머지 둘은 지우는 것이
 * 아니라 그대로 `legacy-export.json` 에 남아 있다 — 마음이 바뀌면 여기에 한 줄
 * 더하고 다시 뽑으면 된다.
 *
 * roomId 로 적는다. 이름은 바뀔 수 있고 roomId 는 안 바뀐다.
 */
const BOXES = [
  '1TFenEiLl8b4FjXNL1FS',   // Def.clar — 3권 34통 (Dada · 클레어 · 에피)
  'Qw7SpKd7F7S5FiruAOtQ',   // 예쁘다   — 7권 75통 (Dada · 에피)
];

/**
 * 옛 uid → 표시용 이름. 생성된 SQL 의 빈칸에 주석으로 붙는다.
 *
 * 여기 다 적어 두되, SQL 에는 **고른 전보함에 실제로 등장하는 사람만** 나간다.
 * 아무 데도 없는 사람의 uuid 를 받아 오라고 하면 그 자리에서 막힌다.
 */
const LABELS = {
  '2SNxPK1lsnQA29bKrQr2xMJrjYB2': 'Dada (stupidpoohh@gmail.com)',
  '7CBIzZaGFMNHS9kvWeC9GFXPeRu2': '클레어',
  'vzGQa9o4k9Nozrc4nQagIrMYKPt2': '에피',
  'mIse6qtQ4OepJAzf5fl50b7M78x1': '이유경',
};

/** 소유자가 비어 있는 전보함의 주인. `예쁘다` 가 그렇다. */
const OWNER_FALLBACK = '2SNxPK1lsnQA29bKrQr2xMJrjYB2';

/**
 * 더 옛 형식의 발신인. `예쁘다` VOL.3~7 은 uid 대신 'a' / 'b' 만 적혀 있고
 * 이름·용지색이 비어 있다. VOL.7 에서 'a' 의 전보가 07.21 13:20 에 끊기고
 * 같은 날 저녁부터 Dada 의 실제 uid 로 이어지는 것으로 사람을 확정했다.
 *
 * VOL.7 의 'a' 행에만 이름 '?' · 용지 'ivory' 가 남아 있다. 그대로 두면 한 권
 * 안에서 같은 사람이 두 색으로 보인다 — 용지색이 발신인이라는 규칙이 그 책에서만
 * 깨진다. 그래서 'a' / 'b' 행은 이름도 용지색도 아래 값으로 통일한다.
 */
const LEGACY_ALIAS = {
  a: { uid: '2SNxPK1lsnQA29bKrQr2xMJrjYB2', name: 'Dada', paper: 'powder' },
  b: { uid: 'vzGQa9o4k9Nozrc4nQagIrMYKPt2', name: '에피', paper: 'blush' },
};

/**
 * 타자기. 옛 앱은 전보함을 여섯 가지 색으로 구분했고, 새 앱은 타자기 네 대로
 * 구분한다 (D9). 개인 설정이라 겹쳐도 되고 앱에서 언제든 바꿀 수 있다.
 */
const TYPEWRITER = {
  violet: 'sugar', // 파스텔 → 설탕
  rose: 'sugar',
  blue: 'steel', // 차가운 파랑 → 강철
  green: 'moss', // 초록 → 이끼
  teal: 'moss',
  ochre: 'oak', // 황토 → 참나무
};

/**
 * 사진 표지. Neon 에는 Storage 가 없다 (D14). cover_kind='photo' 는 cover_value
 * 가 비면 안 되는데 올려 둔 곳이 없으므로 지금은 색으로 떨어뜨린다. 어느 권이
 * 사진이었는지는 생성된 SQL 머리말에 남는다 — 올릴 곳이 생기면 그 목록으로 UPDATE 한다.
 */
const PHOTO_FALLBACK = 'sage';

/* ── 도구 ─────────────────────────────────────────────────────────────────
   uuid 는 옛 id 에서 결정론적으로 뽑는다. 같은 원본이면 같은 uuid 가 나오므로
   두 번 돌려도 행이 겹치지 않는다 (INSERT 는 전부 on conflict do nothing). */

const uuidOf = (...parts) => {
  const h = createHash('md5').update(parts.join(' ')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** 페이지 시각은 'MM.DD HH:MM' 뿐이다. 연도는 권의 기간에서, 시간대는 KST 다. */
const kst = (year, mmdd, hhmm) => `${year}-${mmdd.replace('.', '-')} ${hhmm}:00+09`;

/** 한글은 고정폭 글꼴에서 두 칸을 먹는다. 칸 맞추기는 그 폭으로 센다. */
const width = (s) =>
  [...s].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠]/.test(ch) ? 2 : 1), 0);
const padTo = (s, w) => s + ' '.repeat(Math.max(0, w - width(s)));

/**
 * values 목록 한 덩어리를 찍는다. rows 는 { cells, note } — cells 의 마지막 칸은
 * 닫는 괄호까지만 담고, 줄 사이 쉼표는 여기서 붙인다.
 */
const emit = (rows) => {
  const body = rows.map(({ cells }, i) => [
    ...cells.slice(0, -1),
    cells[cells.length - 1] + (i === rows.length - 1 ? '' : ','),
  ]);
  const w = [];
  for (const r of body) r.forEach((c, i) => (w[i] = Math.max(w[i] ?? 0, width(c))));
  return body.map((r, i) => {
    const note = rows[i].note;
    const cols = r.map((c, j) => (j === r.length - 1 && !note ? c : padTo(c, w[j])));
    return `${cols.join(' ')}${note ? ` ${note}` : ''}`.replace(/\s+$/, '');
  });
};

const rule = (head, w = 74) => `${head} ${'─'.repeat(Math.max(3, w - width(head)))}`;

/* ── 읽기 ─────────────────────────────────────────────────────────────────── */

const data = JSON.parse(readFileSync(SRC, 'utf8'));

const chosen = BOXES.map((roomId) => {
  const box = data.boxes.find((b) => b.roomId === roomId);
  if (!box) throw new Error(`원본에 없는 전보함입니다: ${roomId}`);
  return box;
});
const skipped = data.boxes.filter((b) => !BOXES.includes(b.roomId));

/** 고른 전보함에 실제로 등장하는 사람만 모은다. 등장 순서를 지킨다. */
const people = [];
const meet = (uid) => {
  const real = LEGACY_ALIAS[uid]?.uid ?? uid;
  if (!people.includes(real)) people.push(real);
};
for (const box of chosen) {
  meet(box.ownerUid || OWNER_FALLBACK);
  Object.keys(box.members).forEach(meet);
  box.telegrams.forEach((t) => meet(t.from));
  box.volumes.forEach((v) => v.telegrams.forEach((p) => meet(p.from)));
}
for (const uid of people) {
  if (!LABELS[uid]) throw new Error(`이름을 모르는 사람이 있습니다: ${uid}`);
}

const photoVolumes = [];
const tally = { boxes: 0, members: 0, telegrams: 0, volumes: 0, pages: 0 };
const boxRows = [];
const memberRows = [];
const tgRows = [];
const volRows = [];
const pageBlocks = [];

for (const box of chosen) {
  const boxId = uuidOf('box', box.roomId);
  // `예쁘다` 는 ownerUid 가 빈 문자열이다. Dada 를 소유자로 놓는다.
  const owner = box.ownerUid || OWNER_FALLBACK;
  tally.boxes += 1;

  boxRows.push({
    cells: [
      `  (${q(boxId)},`,
      `${q(box.name)},`,
      `${q(box.coupleCode)},`,
      `${q(owner)},`,
      `${box.currentVol},`,
      `${q(box.createdAt)})`,
    ],
    note: `-- ${box.name}`,
  });

  for (const [uid, m] of Object.entries(box.members)) {
    const type = TYPEWRITER[m.type];
    if (!type) throw new Error(`모르는 타자기 색: ${m.type}`);
    tally.members += 1;
    memberRows.push({
      cells: [`  (${q(boxId)},`, `${q(uid)},`, `${q(m.paper)},`, `${q(type)},`, `${q(m.joinedAt)})`],
      note: `-- ${box.name} · ${m.name} · 옛 ${m.type}`,
    });
  }

  for (const t of box.telegrams) {
    tally.telegrams += 1;
    tgRows.push({
      cells: [
        `  (${q(uuidOf('tg', box.roomId, t.id))},`,
        `${q(boxId)},`,
        `${q(t.from)},`,
        `${q(t.text)},`,
        `${t.vol},`,
        `${q(t.time)})`,
      ],
      note: `-- ${box.name}`,
    });
  }

  for (const v of box.volumes) {
    const volId = uuidOf('vol', box.roomId, v.id);
    const m = /^(\d{4})\.(\d{2})\.(\d{2})\s*[—-]\s*(\d{4})\.(\d{2})\.(\d{2})$/.exec(v.period.trim());
    if (!m) throw new Error(`기간을 읽지 못했습니다: ${box.name} ${v.id} ${v.period}`);
    const [, y0, , , y1] = m;
    if (y0 !== y1) throw new Error(`권이 해를 넘습니다 — 연도 추정을 손봐야 합니다: ${box.name} ${v.id}`);

    const pages = v.telegrams.map((p, i) => {
      const alias = LEGACY_ALIAS[p.from];
      const [mmdd, hhmm] = p.time.split(' ');
      return {
        ord: i + 1,
        uid: alias ? alias.uid : p.from,
        name: alias ? alias.name : p.name,
        paper: alias ? alias.paper : p.paper,
        body: p.text,
        sentAt: kst(y0, mmdd, hhmm),
        aliased: Boolean(alias),
      };
    });
    if (!pages.length) throw new Error(`빈 권입니다: ${box.name} ${v.id}`);
    for (const p of pages) {
      if (!p.name || !p.paper) throw new Error(`이름이나 용지색이 빕니다: ${box.name} ${v.id} #${p.ord}`);
    }

    // period_start / period_end 는 close_volume() 과 같게 첫 전보·마지막 전보의 시각.
    // 원본의 기간 문자열과 날짜가 전부 일치하는 것을 확인했다.
    const periodStart = pages[0].sentAt;
    const periodEnd = pages[pages.length - 1].sentAt;

    const isPhoto = v.cover === 'photo';
    if (isPhoto) photoVolumes.push(`${box.name} VOL.${v.vol}`);
    // 옛 제목은 대개 'VOL.n' 라벨과 같다. 새 서가는 VOL.n 을 따로 그리므로
    // 그대로 넣으면 두 번 찍힌다. 라벨과 같으면 제목 없음으로 둔다.
    const title = v.title && v.title !== v.label ? v.title : '';

    tally.volumes += 1;
    tally.pages += pages.length;

    volRows.push({
      cells: [
        `  (${q(volId)},`,
        `${q(boxId)},`,
        `${v.vol},`,
        `${q(title)},`,
        `${q(isPhoto ? PHOTO_FALLBACK : v.cover)},`,
        `${q(periodStart)},`,
        `${q(periodEnd)},`,
        `${pages.length},`,
        `${q(v.closedAt)})`,
      ],
      note: `-- ${box.name} VOL.${v.vol}${isPhoto ? ' · 옛 표지는 사진' : ''}`,
    });

    pageBlocks.push({ head: `${box.name} VOL.${v.vol} · ${pages.length}통`, volId, pages });
  }
}

/* ── 쓰기 ─────────────────────────────────────────────────────────────────── */

const out = [];
const line = (s = '') => out.push(s);
const bar = '-- ═══════════════════════════════════════════════════════════════════════════';
const head = (t) => line(`-- ═══ ${t} ${'═'.repeat(Math.max(3, 69 - width(t)))}`);

line(bar);
line('-- OLRW — 옛 전보함 이관 (Firestore → Neon)');
line('--');
line(`--   원본: neon/migration/legacy-export.json (${data.exportedAt} 에 꺼냄)`);
line('--   생성: node neon/migration/build.mjs  ← 이 파일을 손으로 고치지 않는다');
line('--   절차: docs/DATA-MIGRATION.md');
line('--');
line(`--   전보함 ${tally.boxes} · 참여 ${tally.members} · 이번 권 전보 ${tally.telegrams}`);
line(`--   · 제본된 권 ${tally.volumes} · 제본된 전보 ${tally.pages}`);
line('--');
if (skipped.length) {
  line('-- 옮기지 않는 전보함 (원본에는 그대로 남아 있다):');
  for (const b of skipped) {
    const n = b.volumes.reduce((a, v) => a + v.telegrams.length, 0);
    line(`--   ${b.name} — ${b.volumes.length}권 ${n}통`);
  }
  line('--');
}
line('-- 이 파일은 테이블에 직접 INSERT 한다. 앱이 아니라 마이그레이션 안에서만 열리는');
line('-- 문이다 — 이관은 소유자·초대코드·created_at 을 원본 그대로 살려야 해서');
line('-- create_box / join_box 로는 할 수 없다. 앱 코드에는 이 문을 열지 않는다.');
line('--');
line('-- 두 번 돌려도 안전하다. 모든 id 를 옛 id 에서 결정론적으로 뽑고');
line('-- (같은 원본 → 같은 uuid), INSERT 는 전부 on conflict do nothing 이다.');
line('--');
line('-- 표지 사진은 아직 없다. Neon 에는 Storage 가 없어 (D14) 아래 권들은 색 표지');
line(`-- '${PHOTO_FALLBACK}' 로 들어간다. 올릴 곳이 생기면 이 목록으로 UPDATE 한다:`);
for (const p of photoVolumes) line(`--   ${p}`);
line(bar);
line();
line('begin;');
line();

head('1. 사람 짝짓기 — 여기만 채운다');
line('--');
line(`-- 옛 파이어베이스 uid 와 새 Neon 계정 uuid 는 서로 남이다. 아래 ${people.length}명이 새 앱에서`);
line('-- 먼저 가입해야 하고, uuid 는 Neon 콘솔 → Tables → profiles 에서 받는다.');
line('--');
line("-- null 을 '…' 로 바꾼다. 하나라도 비면 아래에서 멈추고 누가 빠졌는지 알려준다.");
line('--');
line('-- 임시 테이블이 아니라 진짜 테이블이다 — 편집기가 문장을 따로 실행해도 살아');
line('-- 있어야 한다. 맨 끝(§7)에서 지운다.');
line();
line('drop table if exists legacy_user;');
line('create table legacy_user (');
line('  legacy_uid text primary key,');
line('  label      text not null,');
line('  id         uuid');
line(');');
line();
line('insert into legacy_user (legacy_uid, label, id) values');
emit(
  people.map((uid) => ({
    cells: [`  (${q(uid)},`, `${q(LABELS[uid])},`, 'null)'],
    note: '-- ← 여기에 uuid',
  })),
).forEach(line);
line(';');
line();
line('do $$');
line('declare v_missing text;');
line('begin');
line("  select string_agg(label, ', ') into v_missing from legacy_user where id is null;");
line('  if v_missing is not null then');
line("    raise exception E'아직 uuid 를 채우지 않았습니다: %'");
line("      '\\n       Neon 콘솔 → Tables → profiles 에서 받아 이 파일 §1 에 적으세요.', v_missing;");
line('  end if;');
line();
line("  select string_agg(u.label, ', ') into v_missing");
line('    from legacy_user u left join profiles p on p.id = u.id where p.id is null;');
line('  if v_missing is not null then');
line("    raise exception E'새 앱에 아직 프로필이 없습니다: %'");
line(`      '\\n       위 ${people.length}명이 모두 새 앱에서 가입을 마쳐야 합니다.', v_missing;`);
line('  end if;');
line('end $$;');
line();

head('2. 전보함');
line('-- 옛 coupleCode 를 새 초대 코드로 그대로 쓴다 — 네 사람이 외우고 있는 값이고,');
line('-- 넷 다 새 형식(혼동 문자 I O 0 1 제외)에 맞는다.');
line('-- 봉인은 기본값 그대로 true (D1). 권 번호의 구멍은 메꾸지 않는다.');
line();
line('insert into boxes (id, name, invite_code, owner_id, current_vol, sealed, created_at)');
line('select t.id::uuid, t.name, t.code, u.id, t.vol, true, t.created_at::timestamptz');
line('from (values');
emit(boxRows).forEach(line);
line(') as t(id, name, code, legacy_uid, vol, created_at)');
line('join legacy_user u on u.legacy_uid = t.legacy_uid');
line('on conflict do nothing;');
line();

head('3. 참여자');
line('-- paper_color(용지색)는 공개 정보라 원본 그대로 둔다. type_color 는 타자기이고');
line('-- 개인 설정이다 — 옛 색을 네 대 중 가까운 것으로 옮긴다 (D9). 앱에서 바꿀 수 있다.');
line();
line('insert into box_members (box_id, user_id, paper_color, type_color, joined_at)');
line('select t.box_id::uuid, u.id, t.paper, t.type, t.joined_at::timestamptz');
line('from (values');
emit(memberRows).forEach(line);
line(') as t(box_id, legacy_uid, paper, type, joined_at)');
line('join legacy_user u on u.legacy_uid = t.legacy_uid');
line('on conflict do nothing;');
line();

head('4. 이번 권 전보 (아직 제본되지 않은 것)');
line();
line('insert into telegrams (id, box_id, author_id, body, vol, created_at)');
line('select t.id::uuid, t.box_id::uuid, u.id, t.body, t.vol, t.created_at::timestamptz');
line('from (values');
emit(tgRows).forEach(line);
line(') as t(id, box_id, legacy_uid, body, vol, created_at)');
line('join legacy_user u on u.legacy_uid = t.legacy_uid');
line('on conflict do nothing;');
line();

head('5. 제본된 권');
line('-- period_start / period_end 는 close_volume() 과 같게 첫 전보·마지막 전보의');
line('-- 시각이다. 원본의 기간 문자열과 날짜가 전부 일치하는 것을 확인했다.');
line('-- 페이지 시각에는 연도가 없어 권의 기간에서 가져왔고, 시간대는 KST 로 읽었다.');
line('--');
line("-- read_together 는 true 로 둔다. 옛 앱에는 '함께 읽기' 단계가 없었다 (D2 는 새");
line('-- 결정이다). false 로 두면 옛 책 열네 권마다 "함께 읽기를 건너뛰고 제본했습니다"');
line('-- 가 찍힌다 — 없던 일을 건너뛰었다고 적느니 비워 두는 편이 낫다.');
line('--');
line('-- met_at 은 기본값(now())이 아니라 closed_at 과 같은 값을 넣는다.');
line('-- 제목이 VOL.n 라벨과 같으면 비운다 — 서가가 VOL.n 을 따로 그린다.');
line();
line('insert into volumes (id, box_id, vol, title, cover_kind, cover_value,');
line('                     period_start, period_end, page_count, read_together,');
line('                     met_at, closed_at)');
line("select t.id::uuid, t.box_id::uuid, t.vol, t.title, 'color', t.cover,");
line('       t.period_start::timestamptz, t.period_end::timestamptz, t.pages, true,');
line('       t.closed_at::timestamptz, t.closed_at::timestamptz');
line('from (values');
emit(volRows).forEach(line);
line(') as t(id, box_id, vol, title, cover, period_start, period_end, pages, closed_at)');
line('on conflict do nothing;');
line();

head('6. 제본된 전보 (스냅샷)');
line('-- 이름과 용지색은 제본 시점 값이다. 지금 프로필을 참조하지 않는다.');
line("-- 'a' / 'b' 로만 적힌 더 옛 형식은 사람을 확정해 이름·용지색을 채웠다 —");
line('-- 근거는 neon/migration/build.mjs 의 LEGACY_ALIAS 주석.');
line();
for (const b of pageBlocks) {
  line(`-- ${rule(`── ${b.head}`)}`);
  line('insert into volume_pages (volume_id, ord, author_id, author_name, paper_color, body, sent_at)');
  line('select t.volume_id::uuid, t.ord, u.id, t.author_name, t.paper, t.body, t.sent_at::timestamptz');
  line('from (values');
  emit(
    b.pages.map((p) => ({
      cells: [
        `  (${q(b.volId)},`,
        `${p.ord},`,
        `${q(p.uid)},`,
        `${q(p.name)},`,
        `${q(p.paper)},`,
        `${q(p.body)},`,
        `${q(p.sentAt)})`,
      ],
      note: p.aliased ? '-- 옛 형식' : '',
    })),
  ).forEach(line);
  line(') as t(volume_id, ord, legacy_uid, author_name, paper, body, sent_at)');
  line('join legacy_user u on u.legacy_uid = t.legacy_uid');
  line('on conflict do nothing;');
  line();
}

head('7. 결산');
line('-- 넣은 만큼 들어갔는지 세어 본다. 하나라도 모자라면 여기서 통째로 되돌린다.');
line();
line('do $$');
line('declare');
line('  v_box int; v_mem int; v_tg int; v_vol int; v_page int;');
line('  v_mine  uuid[] := array(select id from legacy_user);');
line('  v_boxes uuid[];');
line('begin');
line('  v_boxes := array(select distinct box_id from box_members where user_id = any (v_mine));');
line('  v_box   := coalesce(array_length(v_boxes, 1), 0);');
line('  select count(*) into v_mem  from box_members  where user_id   = any (v_mine);');
line('  select count(*) into v_tg   from telegrams    where author_id = any (v_mine);');
line('  select count(*) into v_vol  from volumes      where box_id    = any (v_boxes);');
line('  select count(*) into v_page from volume_pages where author_id = any (v_mine);');
line();
line("  raise notice '전보함 % · 참여 % · 이번 권 전보 % · 제본된 권 % · 제본된 전보 %',");
line('    v_box, v_mem, v_tg, v_vol, v_page;');
line();
line(
  `  if v_box < ${tally.boxes} or v_mem < ${tally.members} or v_tg < ${tally.telegrams}` +
    ` or v_vol < ${tally.volumes} or v_page < ${tally.pages} then`,
);
line(
  `    raise exception '들어간 행이 모자랍니다. 기대: 전보함 ${tally.boxes} · 참여 ${tally.members}` +
    ` · 전보 ${tally.telegrams} · 권 ${tally.volumes} · 쪽 ${tally.pages}';`,
);
line('  end if;');
line('end $$;');
line();
line('drop table legacy_user;');
line();
line('commit;');
line();

writeFileSync(OUT, out.join('\n'), 'utf8');
console.log(
  `${OUT}\n  전보함 ${tally.boxes} · 참여 ${tally.members} · 이번 권 전보 ${tally.telegrams}` +
    ` · 제본된 권 ${tally.volumes} · 제본된 전보 ${tally.pages}`,
);
