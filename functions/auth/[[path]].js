/**
 * 로그인 서버를 **우리 주소 밑으로** 데려온다.
 *
 *   https://olrw-8pt.pages.dev/auth/sign-in/email
 *     → https://ep-xxx.neonauth.….neon.tech/neondb/auth/sign-in/email
 *
 * 왜 필요한가. Neon 의 로그인 서버는 다른 사이트(`*.neon.tech`)에 있고, 로그인한
 * 상태는 그 사이트의 쿠키로 유지된다. 사파리는 크로스 사이트 추적 방지를 기본으로
 * 켜 두고 그런 쿠키를 막는다 — 비밀번호가 맞아도 다음 확인이 늘 빈손으로 돌아와
 * 가입도 로그인도 되지 않는다. 브라우저 설정을 바꾸라고 할 일이 아니다.
 *
 * 이 함수를 거치면 브라우저가 보는 상대는 우리 도메인 하나뿐이므로, 쿠키가
 * 퍼스트파티가 되어 추적 방지와 무관해진다.
 *
 * Cloudflare Pages 는 저장소 루트의 `functions/` 를 보고 이 파일을 `/auth/*` 에
 * 얹는다. 빌드 산출물(`dist/`)과는 별개다.
 *
 * 앱은 평소에 Neon 에 **직접** 붙는다. 여기로 오는 것은 직접 붙기가 세션을 남기지
 * 못했을 때뿐이다 (`src/lib/neon.ts`). 그래서 이 함수가 잘못 돌아도 지금 잘 되는
 * 사람의 경로는 건드리지 않는다.
 */

/** 업스트림으로 넘길 요청 헤더. Neon 의 서버 프록시가 넘기는 것과 같은 목록이다. */
const FORWARD = ['user-agent', 'authorization', 'referer', 'content-type', 'x-neon-client-info'];

/** 브라우저로 돌려줄 응답 헤더. */
const PASS_BACK = [
  'content-type', 'content-encoding', 'date',
  'set-auth-jwt', 'set-auth-token', 'x-neon-ret-request-id',
];

/**
 * Data API 주소에서 로그인 서버 주소를 만든다.
 * `@neondatabase/neon-js` 의 `defaultDeriveNeonUrls` 와 같은 규칙이다 —
 * 호스트 첫 라벨 뒤에 `neonauth` 를 끼우고 경로 끝에 `/auth` 를 붙인다.
 */
export function deriveAuthUrl(baseUrl) {
  const url = new URL(baseUrl);
  const [first, ...rest] = url.hostname.split('.');
  if (rest.length < 2) throw new Error(`주소가 짧습니다: ${url.hostname}`);
  const host = [first, 'neonauth', ...rest].join('.');
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${host}${port}${url.pathname.replace(/\/+$/, '')}/auth`;
}

/**
 * 업스트림 쿠키를 우리 도메인 것으로 고친다.
 *
 *   Domain=…      지운다. 남겨 두면 브라우저가 통째로 버린다 — 우리 호스트와
 *                 맞지 않는 도메인의 쿠키는 받지 않는다
 *   Partitioned   지운다. 크로스 사이트일 때만 뜻이 있는 표시다
 *   SameSite      Lax 로 맞춘다. 이제 같은 사이트다
 *   Secure        남긴다 (Pages 는 https 전용)
 */
export function firstParty(setCookie) {
  const parts = setCookie.split(';').map((s) => s.trim()).filter(Boolean);
  const kept = parts.filter((p) => {
    const name = p.split('=')[0].toLowerCase();
    return name !== 'domain' && name !== 'partitioned' && name !== 'samesite';
  });
  kept.push('SameSite=Lax');
  if (!kept.some((p) => p.toLowerCase() === 'secure')) kept.push('Secure');
  return kept.join('; ');
}

export async function onRequest({ request, params, env }) {
  const base = env.VITE_NEON_URL;
  if (!base) {
    return new Response('VITE_NEON_URL 이 없습니다.', { status: 503 });
  }

  let target;
  try {
    const segments = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
    target = new URL(`${deriveAuthUrl(base)}/${segments.join('/')}`);
  } catch (e) {
    return new Response(`주소를 만들지 못했습니다: ${e.message}`, { status: 503 });
  }
  const incoming = new URL(request.url);
  target.search = incoming.search;

  const headers = new Headers();
  for (const h of FORWARD) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  // 업스트림은 Origin 을 신뢰 목록과 대조한다. 우리 주소가 그대로 가야 한다
  // (Neon 콘솔 → Auth → Configuration → Domains 에 등록된 그 주소다).
  headers.set('origin', incoming.origin);

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();

  let res;
  try {
    res = await fetch(target.toString(), {
      method: request.method, headers, body, redirect: 'manual',
    });
  } catch (e) {
    return new Response(`로그인 서버에 닿지 못했습니다: ${e.message}`, { status: 502 });
  }

  const out = new Headers();
  for (const h of PASS_BACK) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  const location = res.headers.get('location');
  if (location) out.set('location', location);
  for (const c of res.headers.getSetCookie()) out.append('set-cookie', firstParty(c));

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}
