/**
 * 오류 문구가 **빠짐없이** 옮겨지는지 본다.
 *
 *   pnpm errors:check
 *
 * 왜 따로 두는가. 화면에 "문제가 생겼습니다" 만 뜨면 사용자도 우리도 무엇이
 * 막혔는지 알 수 없다. 실제로 `session_not_found` 가 표에서 빠져 있었고,
 * 비밀번호가 맞는데도 가입도 로그인도 안 되는 사람이 그 문장 하나만 보고
 * 서 있었다. 눈으로는 절대 안 보이는 종류의 결함이다 — 표에 없는 코드는
 * 그 코드가 실제로 날아오기 전까지 아무 데서도 티가 나지 않는다.
 *
 * 그래서 여기서는 문구를 하나씩 확인하지 않고, **설치된 어댑터가 낼 수 있는
 * 코드 집합 전체**를 패키지에서 읽어 와 우리 표와 맞춰 본다. 어댑터가 올라가
 * 코드가 늘면 이 시험이 먼저 걸린다.
 */
import { build } from 'esbuild';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

/* ── 어댑터가 내는 코드 집합 ───────────────────────────────────────────────
   `AuthErrorCode` 는 export 되지 않으므로 dist 를 글자로 읽는다. 패키지 속을
   들여다보는 것은 무르지만, 못 읽으면 그 자체를 실패로 삼으므로 조용히
   통과하는 일은 없다. */

function adapterCodes() {
  const store = join(ROOT, 'node_modules/.pnpm');
  const dir = readdirSync(store).find((d) => d.startsWith('@neondatabase+auth@'));
  if (!dir) throw new Error('@neondatabase/auth 를 찾지 못했습니다 (pnpm install 을 먼저 하세요).');
  const dist = join(store, dir, 'node_modules/@neondatabase/auth/dist');
  const file = readdirSync(dist).find((f) => f.startsWith('better-auth-helpers') && f.endsWith('.mjs'));
  if (!file) throw new Error(`better-auth-helpers*.mjs 가 없습니다 — 어댑터 구조가 바뀌었습니다 (${dist}).`);

  const src = readFileSync(join(dist, file), 'utf8');
  const block = src.match(/const AuthErrorCode = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('AuthErrorCode 표를 찾지 못했습니다 — 어댑터 구조가 바뀌었습니다.');
  const codes = [...block[1].matchAll(/:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]);
  if (codes.length < 20) throw new Error(`코드를 ${codes.length}개만 찾았습니다 — 읽기가 어긋났습니다.`);
  return codes;
}

/* ── errors.ts 를 그대로 불러온다 ─────────────────────────────────────────── */

const bundled = await build({
  entryPoints: [join(ROOT, 'src/lib/errors.ts')],
  bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const { toUserMessage, errorTag, KNOWN_AUTH_CODES } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

/* ── 시험 ─────────────────────────────────────────────────────────────────── */

const FALLBACK = '문제가 생겼습니다. 잠시 후 다시 시도해 주세요.';

const codes = adapterCodes();
console.log(`어댑터가 내는 코드 ${codes.length}개`);

const missing = codes.filter((c) => !KNOWN_AUTH_CODES.includes(c));
ok('어댑터의 코드를 표가 전부 덮는다', missing.length === 0,
  missing.length ? `빠진 것: ${missing.join(', ')}` : `${codes.length}개`);

// unknown_error 만은 fallback 과 같은 문장이어도 된다 — 뜻이 그것이다.
const silent = codes.filter((c) => c !== 'unknown_error'
  && toUserMessage({ code: c, message: '' }) === FALLBACK);
ok('어느 코드도 "문제가 생겼습니다" 로 떨어지지 않는다', silent.length === 0,
  silent.length ? silent.join(', ') : '');

// 아무개가 막혔던 자리. 이 셋이 fallback 이면 같은 일이 다시 벌어진다.
for (const [code, must] of [
  ['session_not_found', '다시 로그인'],
  ['internal_error', '저장하지 못했습니다'],
  ['identity_not_found', '비밀번호를 잊으셨나요'],
]) {
  const msg = toUserMessage({ code, message: 'Failed to retrieve user session' });
  ok(`${code} 는 무엇을 해야 하는지 말한다`, msg.includes(must), msg);
}

// 403 은 우리 앱에서 주소 미등록 하나뿐이다. 클릭 경로가 문장에 있어야 한다.
{
  const msg = toUserMessage({ code: 'feature_not_supported', message: 'Feature not available' });
  ok('403 은 주소 등록 경로를 알려 준다', msg.includes('Auth → Configuration → Domains'), msg);
}
{
  const msg = toUserMessage({ code: 'unknown', message: 'Invalid origin' });
  ok('Invalid origin 도 같은 경로를 알려 준다', msg.includes('Domains'), msg);
}

// 우리가 직접 쓴 한국어 문장은 코드가 붙어 있어도 그대로 나간다.
{
  const e = Object.assign(new Error('계정은 만들었지만 이 브라우저가 …'), { code: 'session_not_stored' });
  ok('우리 한국어 문장이 코드에 먹히지 않는다', toUserMessage(e).startsWith('계정은 만들었지만'));
  ok('그 오류에도 표식이 남는다', errorTag(e) === 'session_not_stored');
}

// 서버 함수가 raise 한 문장.
ok('서버 함수의 한국어는 그대로 나간다',
  toUserMessage({ message: '정원이 가득 찼습니다.' }) === '정원이 가득 찼습니다.');

// 표식은 코드가 없으면 상태 코드라도 남긴다 — 스크린샷 한 장으로 자리를 안다.
ok('코드가 없으면 HTTP 상태를 남긴다', errorTag({ status: 429 }) === 'HTTP 429');
ok('제대로 옮긴 오류에는 표식을 달지 않는다',
  codes.every((c) => errorTag({ code: c }) === ''),
  codes.filter((c) => errorTag({ code: c }) !== '').join(', '));
ok('아무것도 없으면 표식도 없다', errorTag(new Error('x')) === '');

// 모르는 것은 여전히 담백하게. 다만 콘솔에는 원본이 남는다.
{
  const before = console.error;
  let logged = false;
  console.error = () => { logged = true; };
  const msg = toUserMessage({ message: 'Something entirely new' });
  console.error = before;
  ok('모르는 오류는 fallback 이고 원본은 콘솔에 남는다', msg === FALLBACK && logged);
}

console.log(failed ? `\n━━━ ${failed}건 실패 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
