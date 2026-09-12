/**
 * 표지 업로드 함수(`functions/cover/[[path]].js`)를 Node 에서 그대로 돌려 본다.
 *
 *   pnpm cover:check
 *
 * 로그인 중계와 같은 사정이다 — Cloudflare 위에서만 도는 코드라 배포 전에는
 * 아무도 실행해 보지 않는다. 여기가 어긋나면 남의 전보함에 사진을 밀어 넣거나,
 * 반대로 제 전보함에도 못 올리게 된다.
 *
 * Pages Function 은 표준 Request/Response 를 받는 순수 함수이고, R2 는 `get` ·
 * `put` 두 가지만 쓰므로 가짜 버킷으로 대신한다.
 */
import { defaultDeriveNeonUrls } from '@neondatabase/neon-js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { onRequest, deriveDataApiUrl, isJpeg, isMember } = await import(
  pathToFileURL(join(ROOT, 'functions/cover/[[path]].js')).href
);

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

const NEON = 'https://ep-cool-rain-123.c-4.ap-southeast-1.aws.neon.tech/neondb';
const BOX = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-8888-4777-8666-555555555555';
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 가짜 R2. put 한 것을 get 으로 돌려준다. */
const makeBucket = () => {
  const store = new Map();
  return {
    store,
    async put(key, body, opts) { store.set(key, { body, opts }); },
    async get(key) {
      const v = store.get(key);
      return v ? { body: v.body, httpEtag: '"fake"' } : null;
    },
  };
};

/** 멤버인 전보함에만 행을 돌려주는 가짜 Data API. RLS 를 흉내낸다. */
const makeFetch = (memberOf, token = 'good') => async (url, init) => {
  const auth = init?.headers?.authorization ?? '';
  const u = new URL(url);
  const id = (u.searchParams.get('id') ?? '').replace(/^eq\./, '');
  if (auth !== `Bearer ${token}`) return new Response('[]', { status: 401 });
  const rows = memberOf.includes(id) ? [{ id }] : [];
  return new Response(JSON.stringify(rows), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};

const call = (method, path, { env, body, headers } = {}) => onRequest({
  request: new Request(`https://olrw-8pt.pages.dev/cover/${path}`, {
    method, body, headers: headers ?? {},
  }),
  params: { path: path ? path.split('/').filter(Boolean) : [] },
  env,
});

/* ── 1. 주소 유도는 SDK 와 같은가 ─────────────────────────────────────────
   규칙을 SDK 에서 베껴 썼다. SDK 가 바꾸면 여기서 먼저 걸려야 한다. */
console.log('━━━ 주소 ━━━');
{
  const mine = deriveDataApiUrl(NEON);
  const theirs = defaultDeriveNeonUrls(NEON).dataApi;
  ok('Data API 주소가 SDK 와 같다', mine === theirs, mine === theirs ? mine : `${mine} ≠ ${theirs}`);
}

/* ── 2. 어디까지 함수를 타는가 ────────────────────────────────────────── */
console.log('\n━━━ 경로 ━━━');
{
  const routes = JSON.parse(readFileSync(join(ROOT, 'public/_routes.json'), 'utf8'));
  ok('`/cover/*` 가 함수를 탄다', routes.include.includes('/cover/*'));
  ok('`/auth/*` 도 그대로 있다', routes.include.includes('/auth/*'));
  ok('전부를 가로채지 않는다', !routes.include.includes('/*'),
     JSON.stringify(routes.include));
}

/* ── 3. 버킷이 없으면 ────────────────────────────────────────────────── */
console.log('\n━━━ 버킷이 없을 때 ━━━');
{
  const res = await call('HEAD', '', { env: { VITE_NEON_URL: NEON } });
  ok('묶이지 않았으면 503 이다', res.status === 503, `HTTP ${res.status}`);
  ok('그 답을 "된다"로 읽을 수 없다', res.status !== 204 && res.status !== 200);
}

/* ── 4. 살아 있는가 ──────────────────────────────────────────────────── */
console.log('\n━━━ 살아 있을 때 ━━━');
{
  const env = { VITE_NEON_URL: NEON, COVERS: makeBucket() };
  const res = await call('HEAD', '', { env });
  ok('묶여 있으면 204 다', res.status === 204, `HTTP ${res.status}`);
  ok('그 답을 캐시하지 않는다', res.headers.get('cache-control') === 'no-store');
}

/* ── 5. 권한 ─────────────────────────────────────────────────────────── */
console.log('\n━━━ 권한 (RLS 에 물어본다) ━━━');
{
  const bucket = makeBucket();
  const env = { VITE_NEON_URL: NEON, COVERS: bucket };
  globalThis.fetch = makeFetch([BOX]);

  const noToken = await call('PUT', BOX, { env, body: JPEG });
  ok('토큰이 없으면 401', noToken.status === 401, `HTTP ${noToken.status}`);

  const bad = await call('PUT', BOX, {
    env, body: JPEG, headers: { authorization: 'Bearer wrong' },
  });
  ok('토큰이 틀리면 403', bad.status === 403, `HTTP ${bad.status}`);

  const notMine = await call('PUT', OTHER, {
    env, body: JPEG, headers: { authorization: 'Bearer good' },
  });
  ok('남의 전보함에는 올릴 수 없다', notMine.status === 403, `HTTP ${notMine.status}`);
  ok('남의 전보함에 아무것도 쓰이지 않았다', bucket.store.size === 0, `${bucket.store.size}개`);

  const junk = await call('PUT', 'not-a-uuid', {
    env, body: JPEG, headers: { authorization: 'Bearer good' },
  });
  ok('전보함 id 가 uuid 가 아니면 거절한다', junk.status === 400, `HTTP ${junk.status}`);
}

/* ── 6. 무엇을 받는가 ────────────────────────────────────────────────── */
console.log('\n━━━ 받는 것 ━━━');
let uploaded = '';
{
  const bucket = makeBucket();
  const env = { VITE_NEON_URL: NEON, COVERS: bucket };
  globalThis.fetch = makeFetch([BOX]);
  const head = { authorization: 'Bearer good' };

  const png = await call('PUT', BOX, { env, body: PNG, headers: head });
  ok('JPEG 이 아니면 거절한다 (헤더가 아니라 내용을 본다)', png.status === 415, `HTTP ${png.status}`);

  const empty = await call('PUT', BOX, { env, body: new Uint8Array(0), headers: head });
  ok('빈 파일은 거절한다', empty.status === 400, `HTTP ${empty.status}`);

  const huge = new Uint8Array(600 * 1024);
  huge.set(JPEG);
  const big = await call('PUT', BOX, { env, body: huge, headers: head });
  ok('너무 큰 사진은 거절한다', big.status === 413, `HTTP ${big.status}`);

  ok('거절당한 것은 하나도 저장되지 않았다', bucket.store.size === 0, `${bucket.store.size}개`);

  const good = await call('PUT', BOX, { env, body: JPEG, headers: head });
  ok('제 전보함에는 올라간다', good.status === 201, `HTTP ${good.status}`);
  const body = await good.json();
  uploaded = body.path ?? '';
  ok('경로를 돌려준다', /^\/cover\/[0-9a-f-]{36}\/[0-9a-f]{32}\.jpg$/.test(uploaded), uploaded);
  ok('base64 가 아니라 경로다 (데이터 규칙 3)', !uploaded.startsWith('data:'));
  ok('버킷에 한 장 들어갔다', bucket.store.size === 1);

  const again = await call('PUT', BOX, { env, body: JPEG, headers: head });
  const second = (await again.json()).path;
  ok('이름이 매번 다르다 (덮어쓰지 않는다)', second !== uploaded);

  const keys = [...bucket.store.keys()];
  ok('전보함별로 갈라 둔다', keys.every((k) => k.startsWith(`covers/${BOX}/`)), keys[0]);
}

/* ── 7. 내려주기 ─────────────────────────────────────────────────────── */
console.log('\n━━━ 내려주기 ━━━');
{
  const bucket = makeBucket();
  const env = { VITE_NEON_URL: NEON, COVERS: bucket };
  globalThis.fetch = makeFetch([BOX]);
  const put = await call('PUT', BOX, {
    env, body: JPEG, headers: { authorization: 'Bearer good' },
  });
  const path = (await put.json()).path.replace(/^\/cover\//, '');

  const got = await call('GET', path, { env });
  ok('올린 것을 그대로 내려준다', got.status === 200, `HTTP ${got.status}`);
  ok('언제나 image/jpeg 로 내려준다', got.headers.get('content-type') === 'image/jpeg');
  ok('브라우저가 형식을 추측하지 않게 한다',
     got.headers.get('x-content-type-options') === 'nosniff');
  ok('스크립트로 읽히지 않게 막는다',
     (got.headers.get('content-security-policy') ?? '').includes('sandbox'));
  ok('공유 캐시에 남기지 않는다',
     (got.headers.get('cache-control') ?? '').startsWith('private'),
     got.headers.get('cache-control'));

  const missing = await call('GET', `${BOX}/${'0'.repeat(32)}.jpg`, { env });
  ok('없는 표지는 404', missing.status === 404, `HTTP ${missing.status}`);

  const traversal = await call('GET', `${BOX}/..%2F..%2Fsecret.jpg`, { env });
  ok('경로를 거슬러 올라갈 수 없다', traversal.status === 404, `HTTP ${traversal.status}`);

  const wrongShape = await call('GET', `${BOX}/cover.png`, { env });
  ok('이름 모양이 다르면 404', wrongShape.status === 404, `HTTP ${wrongShape.status}`);
}

/* ── 8. 그 밖의 방식 ─────────────────────────────────────────────────── */
console.log('\n━━━ 그 밖 ━━━');
{
  const env = { VITE_NEON_URL: NEON, COVERS: makeBucket() };
  const del = await call('DELETE', BOX, { env });
  ok('지우기는 열어 두지 않는다', del.status === 405, `HTTP ${del.status}`);
  ok('JPEG 판정은 앞 세 바이트로 한다', isJpeg(JPEG) && !isJpeg(PNG) && !isJpeg(new Uint8Array(2)));
  ok('isMember 는 행이 없으면 거짓이다',
     (await isMember(deriveDataApiUrl(NEON), 'good', OTHER, makeFetch([BOX]))) === false);
}

console.log(failed ? `\n━━━ ${failed}건 실패 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
