/**
 * 로그인 프록시(`functions/auth/[[path]].js`)가 제대로 넘기는지 본다.
 *
 *   pnpm proxy:check
 *
 * 왜 필요한가. 이 함수는 Cloudflare 위에서만 도는 코드라 배포하기 전에는
 * 아무도 실행해 보지 않는다. 그런데 여기가 어긋나면 **로그인이 통째로**
 * 막힌다 — 주소를 한 글자 잘못 만들면 그대로 404 다.
 *
 * 다행히 Pages Function 은 표준 Request/Response 를 받는 순수 함수라,
 * `fetch` 만 가짜로 바꿔 끼우면 Node 에서 그대로 돌려 볼 수 있다.
 *
 * 가장 중요한 시험은 첫 번째다. 주소 유도 규칙을 SDK 에서 베껴 썼으므로,
 * **SDK 의 진짜 함수와 결과가 같은지** 매번 대조한다. SDK 가 규칙을 바꾸면
 * 여기서 먼저 걸린다.
 */
import { defaultDeriveNeonUrls } from '@neondatabase/neon-js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { onRequest, deriveAuthUrl, firstParty } = await import(
  pathToFileURL(join(ROOT, 'functions/auth/[[path]].js')).href
);

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

const NEON = 'https://ep-cool-rain-123.c-4.ap-southeast-1.aws.neon.tech/neondb';
const ENV = { VITE_NEON_URL: NEON };

/* ── 어디까지 함수를 타는가 ───────────────────────────────────────────────
   `_routes.json` 이 없으면 Cloudflare 는 **모든 요청**을 함수로 보낸다.
   그러면 `/* → index.html` 인 SPA 를 함수가 가로채 앱이 아예 뜨지 않는다.
   반대로 `/auth/*` 가 빠지면 프록시가 붙지 않는다. */

{
  const routes = JSON.parse(readFileSync(join(ROOT, 'public/_routes.json'), 'utf8'));
  ok('로그인 경로만 함수를 탄다',
    Array.isArray(routes.include) && routes.include.length === 1 && routes.include[0] === '/auth/*',
    JSON.stringify(routes.include));
  ok('빌드하면 dist 로 따라간다', existsSync(join(ROOT, 'dist/_routes.json')));
}

/* ── 주소 유도 ────────────────────────────────────────────────────────────── */

for (const base of [
  NEON,
  'https://ep-x.c-2.us-east-2.aws.neon.build/dbname',
  'https://ep-y.a.b.c.example.test:8443/db/',
]) {
  ok(`SDK 와 같은 주소를 만든다 (${new URL(base).hostname})`,
    deriveAuthUrl(base) === defaultDeriveNeonUrls(base).auth,
    `${deriveAuthUrl(base)}`);
}

/* ── 쿠키 고치기 ──────────────────────────────────────────────────────────── */

{
  const got = firstParty(
    'neon-auth.session_token=abc; Path=/; Domain=.neon.tech; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=604800');
  ok('다른 사이트 도메인을 지운다', !/domain=/i.test(got), got);
  ok('Partitioned 를 지운다', !/partitioned/i.test(got));
  ok('SameSite 는 Lax 로 맞춘다', /SameSite=Lax/.test(got) && !/SameSite=None/i.test(got));
  ok('Secure 는 남긴다', /(^|; )Secure(;|$)/.test(got));
  ok('값과 Path 와 수명은 그대로다',
    got.startsWith('neon-auth.session_token=abc') && /Path=\//.test(got) && /Max-Age=604800/.test(got));
}
{
  const got = firstParty('a=b; Path=/');
  ok('Secure 가 없던 쿠키에는 붙인다', /Secure/.test(got) && /SameSite=Lax/.test(got), got);
}

/* ── 프록시 ───────────────────────────────────────────────────────────────── */

/** fetch 를 가로채 무엇을 어디로 보냈는지 남긴다. */
function spy(reply) {
  const seen = {};
  globalThis.fetch = async (url, init) => {
    seen.url = String(url);
    seen.method = init.method;
    seen.headers = init.headers;
    seen.body = init.body;
    return reply();
  };
  return seen;
}
const realFetch = globalThis.fetch;

const upstream = (init = {}) => {
  const h = new Headers(init.headers ?? {});
  return new Response(init.body ?? '{"ok":true}', {
    status: init.status ?? 200, statusText: init.statusText ?? 'OK', headers: h,
  });
};

{
  const seen = spy(() => {
    const h = new Headers({ 'content-type': 'application/json', 'set-auth-jwt': 'jwt-abc' });
    h.append('set-cookie', 'neon-auth.session_token=t1; Path=/; Domain=.neon.tech; Secure; SameSite=None');
    h.append('set-cookie', 'neon-auth.session_data=t2; Path=/; Secure; SameSite=None');
    return upstream({ headers: h });
  });

  const req = new Request('https://olrw-8pt.pages.dev/auth/sign-in/email?a=1', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cookie': 'neon-auth.session_token=old',
      'user-agent': 'Safari',
      'x-neon-client-info': 'olrw',
      'x-secret-of-mine': 'must-not-travel',   // 목록에 없는 헤더는 넘기지 않는다
    },
    body: '{"email":"a@b.c"}',
  });
  const res = await onRequest({ request: req, params: { path: ['sign-in', 'email'] }, env: ENV });

  ok('업스트림 주소를 바로 짚는다',
    seen.url === `${defaultDeriveNeonUrls(NEON).auth}/sign-in/email?a=1`, seen.url);
  ok('메서드와 본문을 그대로 넘긴다',
    seen.method === 'POST' && new TextDecoder().decode(seen.body) === '{"email":"a@b.c"}');
  ok('쿠키를 그대로 넘긴다', seen.headers.get('cookie') === 'neon-auth.session_token=old');
  ok('Origin 은 우리 주소로 보낸다', seen.headers.get('origin') === 'https://olrw-8pt.pages.dev',
    seen.headers.get('origin'));
  ok('목록에 없는 헤더는 넘기지 않는다', seen.headers.get('x-secret-of-mine') === null);
  ok('클라이언트 표식은 넘긴다', seen.headers.get('x-neon-client-info') === 'olrw');

  const cookies = res.headers.getSetCookie();
  ok('쿠키 두 장을 모두 돌려준다', cookies.length === 2, `${cookies.length}장`);
  ok('돌려주는 쿠키는 전부 우리 것이 된다',
    cookies.every((c) => !/domain=/i.test(c) && /SameSite=Lax/.test(c)), cookies.join(' | '));
  ok('JWT 헤더를 돌려준다', res.headers.get('set-auth-jwt') === 'jwt-abc');
  ok('본문과 상태를 그대로 돌려준다', res.status === 200 && (await res.json()).ok === true);
}

{
  // 세션 조회는 GET 이다. 본문을 붙이면 fetch 가 거부한다.
  const seen = spy(() => upstream());
  const req = new Request('https://olrw-8pt.pages.dev/auth/get-session', { method: 'GET' });
  await onRequest({ request: req, params: { path: ['get-session'] }, env: ENV });
  ok('GET 에는 본문을 붙이지 않는다', seen.body === undefined);
}

{
  // 오류도 그대로 전한다. 여기서 200 으로 덮으면 화면이 성공한 줄 안다.
  spy(() => upstream({ status: 401, statusText: 'Unauthorized', body: '{"code":"INVALID_EMAIL_OR_PASSWORD"}' }));
  const req = new Request('https://olrw-8pt.pages.dev/auth/sign-in/email', { method: 'POST', body: '{}' });
  const res = await onRequest({ request: req, params: { path: ['sign-in', 'email'] }, env: ENV });
  ok('업스트림 오류를 그대로 전한다', res.status === 401 && (await res.text()).includes('INVALID_EMAIL'));
}

{
  // 로그인 서버에 닿지 못하면 502 로 알린다. 조용히 200 을 주면 안 된다.
  globalThis.fetch = async () => { throw new Error('연결 끊김'); };
  const req = new Request('https://olrw-8pt.pages.dev/auth/get-session');
  const res = await onRequest({ request: req, params: { path: ['get-session'] }, env: ENV });
  ok('닿지 못하면 502 로 알린다', res.status === 502);
}

{
  const req = new Request('https://olrw-8pt.pages.dev/auth/get-session');
  const res = await onRequest({ request: req, params: { path: ['get-session'] }, env: {} });
  ok('설정이 없으면 503 으로 알린다', res.status === 503);
}
{
  const req = new Request('https://olrw-8pt.pages.dev/auth/get-session');
  const res = await onRequest({
    request: req, params: { path: ['get-session'] }, env: { VITE_NEON_URL: 'https://localhost/db' },
  });
  ok('주소가 이상하면 503 으로 알린다', res.status === 503);
}

globalThis.fetch = realFetch;
console.log(failed ? `\n━━━ ${failed}건 실패 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
