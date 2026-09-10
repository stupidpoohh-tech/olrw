/**
 * 실사용 데이터가 저장소로 돌아오지 않았는지 본다.
 *
 *   pnpm secrets:check
 *
 * 왜 필요한가. 이관 원본(이메일·옛 uid·전보 본문)과 파이어베이스 설정이 공개
 * 저장소에 올라가 있었다. 지금은 걷어냈지만, 걷어낸 상태는 저절로 유지되지
 * 않는다 — `.gitignore` 를 우회해 `git add -f` 한 번이면 되돌아간다.
 *
 * 그래서 값 목록이 아니라 **모양**으로 지킨다. 진짜 값은 저장소에 없으므로
 * (그게 요점이다) 여기에 적을 수도 없다. 실사용 메일 도메인, 파이어베이스
 * 설정 키, 되살아나면 안 되는 경로를 본다.
 *
 * 걸리면 무엇이 걸렸는지는 **파일과 종류만** 말하고 값은 찍지 않는다.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);

/* ── 되돌아오면 안 되는 경로 ─────────────────────────────────────────────── */

const BANNED = [
  ['public/migrate.html', '옛 파이어베이스에서 데이터를 꺼내던 임시 페이지'],
  ['neon/migration/legacy-export.json', '이관 원본 (이메일 · 옛 uid · 전보 본문)'],
  ['neon/migration/0002_legacy.sql', '이관 생성물 (실사용 값이 박힌다)'],
];
for (const [path, why] of BANNED) {
  ok(`${path} 가 없다`, !tracked.includes(path), why);
}
ok('neon/migration/local/ 이 추적되지 않는다',
  !tracked.some((f) => f.startsWith('neon/migration/local/')),
  '진짜 원본 · 짝짓기 값 · 생성물이 있는 자리');

/* ── 모양으로 거른다 ─────────────────────────────────────────────────────── */

const BINARY = /\.(woff2?|ttf|otf|png|jpe?g|webp|wav|mp3|mov|ico|gif|pdf)$/i;

/** 견본·시험이 쓰는 주소는 실사용이 아니다. */
const SAFE_MAIL = /@(example\.(com|test|org)|olrw\.test|[a-z0-9-]+\.invalid)$/i;

const RULES = [
  {
    name: '실사용 메일 주소',
    re: /[A-Za-z0-9._%+-]+@(gmail|naver|daum|kakao|hanmail|nate|outlook|yahoo|icloud|proton(mail)?)\.[A-Za-z.]{2,}/g,
    // 커밋 author 는 git 이 들고 있고 파일이 아니다. 여기서는 파일만 본다.
    skip: () => false,
  },
  {
    // 키만 있고 값이 자리표면 문제가 아니다. 채워진 값만 잡는다.
    name: '파이어베이스 설정',
    re: /\b(apiKey|messagingSenderId|storageBucket|appId|projectId|authDomain)\s*:\s*['"][^'"]+['"]/g,
    placeholder: /:\s*['"](\.\.\.|…|<[^'"]*>|YOUR[_A-Z]*|xxx+|\s*)['"]/i,
    // 옛 규칙 문서는 설정값이 아니라 규칙만 담는다.
    skip: (file) => file.startsWith('legacy-firebase/'),
  },
  {
    name: '데이터베이스 접속 문자열',
    re: /postgres(ql)?:\/\/[^\s'"]+:[^\s'"]+@/g,
    skip: () => false,
  },
];

const hits = new Map();
for (const file of tracked) {
  if (BINARY.test(file)) continue;
  let text;
  try { text = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; }
  for (const rule of RULES) {
    if (rule.skip(file)) continue;
    const found = text.match(rule.re);
    if (!found) continue;
    const real = rule.name === '실사용 메일 주소'
      ? found.filter((m) => !SAFE_MAIL.test(m))
      : rule.placeholder ? found.filter((m) => !rule.placeholder.test(m)) : found;
    if (!real.length) continue;
    const key = `${file} · ${rule.name}`;
    hits.set(key, (hits.get(key) ?? 0) + real.length);
  }
}
ok('추적 중인 파일에 실사용 값이 없다', hits.size === 0,
  hits.size ? [...hits].map(([k, n]) => `${k} (${n})`).join(' / ') : `${tracked.length}개 확인`);

/* ── 빌드 산출물에도 새지 않는가 ─────────────────────────────────────────── */

let dist = [];
try {
  dist = execSync("find dist -type f -not -name '*.woff2' -not -name '*.webp' -not -name '*.wav'",
    { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
} catch { /* 아직 빌드하지 않았다 */ }

if (dist.length) {
  const bad = [];
  for (const file of dist) {
    let text;
    try { text = readFileSync(join(ROOT, file), 'utf8'); } catch { continue; }
    for (const rule of RULES) {
      const found = text.match(rule.re);
      if (!found) continue;
      const real = rule.name === '실사용 메일 주소'
        ? found.filter((m) => !SAFE_MAIL.test(m))
        : rule.placeholder ? found.filter((m) => !rule.placeholder.test(m)) : found;
      if (real.length) bad.push(`${file} · ${rule.name}`);
    }
  }
  ok('빌드 산출물에도 실사용 값이 없다', bad.length === 0,
    bad.length ? bad.join(' / ') : `${dist.length}개 확인`);
} else {
  console.log('SKIP  빌드 산출물 검사 — dist/ 가 없습니다 (pnpm build 를 먼저)');
}

console.log(failed ? `\n━━━ ${failed}건 실패 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
