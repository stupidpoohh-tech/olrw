/**
 * 표지 사진을 우리 주소 밑에 둔다.
 *
 *   PUT  /cover/<전보함 uuid>         사진 한 장을 올린다 → { path }
 *   GET  /cover/<전보함 uuid>/<이름>  그 사진을 내려준다
 *
 * 왜 서버가 필요한가. Neon 에는 파일을 둘 곳이 없다 (D14). 그래서 사진 표지는
 * Neon 으로 옮기면서 통째로 빠졌고, 옛 권 여덟 개도 색 표지로 들어갔다.
 * Cloudflare R2 를 붙이면 되는데, 브라우저가 R2 에 바로 쓸 수는 없다 —
 * 권한을 확인하고 대신 써 줄 자리가 있어야 한다. 그 자리가 여기다.
 *
 * **권한은 우리가 새로 정하지 않는다.** 올리려는 사람이 그 전보함의 멤버인지를
 * Data API 에 **그 사람의 토큰으로** 물어본다. RLS 가 멤버에게만 행을 돌려주므로
 * (`boxes_read`), 행이 오면 멤버이고 안 오면 아니다. 규칙을 두 벌 쓰지 않는다.
 *
 * 읽기는 토큰을 실을 수 없다 — `<img src>` 는 헤더를 못 붙인다. 그래서 이름을
 * 128비트 난수로 짓고 목록을 열지 않는다. 주소를 아는 사람만 볼 수 있다는 뜻이고,
 * 그것이 이 방식의 한계다 (docs/SETUP.md).
 */

/** 클라이언트가 320×448 JPEG 로 줄여서 보낸다 (`src/features/ritual/cover.ts`). */
const MAX_BYTES = 512 * 1024;
const KEY_RE = /^[0-9a-f]{32}\.jpg$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data API 주소를 만든다. `@neondatabase/neon-js` 의 `defaultDeriveNeonUrls` 와
 * 같은 규칙이다 — 호스트 첫 라벨 뒤에 `apirest` 를 끼우고 경로 끝에 `/rest/v1`.
 */
export function deriveDataApiUrl(baseUrl) {
  const url = new URL(baseUrl);
  const [first, ...rest] = url.hostname.split('.');
  if (rest.length < 2) throw new Error(`주소가 짧습니다: ${url.hostname}`);
  const host = [first, 'apirest', ...rest].join('.');
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${host}${port}${url.pathname.replace(/\/+$/, '')}/rest/v1`;
}

/** JPEG 인가. 헤더는 거짓말을 할 수 있으니 앞 세 바이트를 직접 본다. */
export function isJpeg(bytes) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** 파일 이름. 목록을 열지 않으므로 이 난수가 유일한 자물쇠다. */
function newKey() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('') + '.jpg';
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json; charset=utf-8' },
  });

/**
 * 이 사람이 그 전보함의 멤버인가. 그 사람의 토큰으로 물어본다.
 * 멤버가 아니면 RLS 가 빈 배열을 돌려준다 — 없는 전보함과 구별되지 않는데,
 * 그래야 남의 전보함이 있는지 없는지도 캘 수 없다.
 */
export async function isMember(dataApi, token, boxId, fetchImpl = fetch) {
  const url = `${dataApi}/boxes?id=eq.${encodeURIComponent(boxId)}&select=id`;
  const res = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => null);
  return Array.isArray(rows) && rows.length === 1;
}

export async function onRequest({ request, params, env }) {
  const bucket = env.COVERS;
  if (!bucket) return json(503, { error: '표지 저장소가 아직 연결되지 않았습니다.' });

  const segments = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);

  /* ── 살아 있는가 ──────────────────────────────────────────────────────── */
  // 앱이 부팅할 때 한 번 묻는다. 여기까지 왔다는 것은 버킷이 묶여 있다는 뜻이다
  // (안 묶였으면 위에서 503 으로 끝났다). 사진 칸을 내줄지 이 답으로 정한다.
  if ((request.method === 'GET' || request.method === 'HEAD') && segments.length === 0) {
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }

  /* ── 내려주기 ─────────────────────────────────────────────────────────── */
  if (request.method === 'GET' || request.method === 'HEAD') {
    const [boxId, name] = segments;
    if (!UUID_RE.test(boxId ?? '') || !KEY_RE.test(name ?? '')) {
      return new Response('없는 표지입니다.', { status: 404 });
    }
    const obj = await bucket.get(`covers/${boxId.toLowerCase()}/${name}`);
    if (!obj) return new Response('없는 표지입니다.', { status: 404 });

    // 저장할 때 정한 것만 돌려준다. 저장된 메타데이터를 그대로 흘리지 않는다.
    return new Response(request.method === 'HEAD' ? null : obj.body, {
      headers: {
        'content-type': 'image/jpeg',
        'cache-control': 'private, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        etag: obj.httpEtag,
      },
    });
  }

  /* ── 올리기 ───────────────────────────────────────────────────────────── */
  if (request.method !== 'PUT') {
    return json(405, { error: '지원하지 않는 방식입니다.' });
  }

  const base = env.VITE_NEON_URL;
  if (!base) return json(503, { error: 'VITE_NEON_URL 이 없습니다.' });

  const [boxId] = segments;
  if (!UUID_RE.test(boxId ?? '')) return json(400, { error: '전보함을 알 수 없습니다.' });

  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return json(401, { error: '로그인이 필요합니다.' });

  let dataApi;
  try {
    dataApi = deriveDataApiUrl(base);
  } catch (e) {
    return json(503, { error: `주소를 만들지 못했습니다: ${e.message}` });
  }

  let allowed;
  try {
    allowed = await isMember(dataApi, token, boxId.toLowerCase());
  } catch (e) {
    return json(502, { error: `권한을 확인하지 못했습니다: ${e.message}` });
  }
  if (!allowed) return json(403, { error: '이 전보함에 표지를 올릴 수 없습니다.' });

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length === 0) return json(400, { error: '빈 파일입니다.' });
  if (body.length > MAX_BYTES) return json(413, { error: '사진이 너무 큽니다.' });
  if (!isJpeg(body)) return json(415, { error: 'JPEG 사진만 올릴 수 있습니다.' });

  const name = newKey();
  try {
    await bucket.put(`covers/${boxId.toLowerCase()}/${name}`, body, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, max-age=31536000, immutable' },
    });
  } catch (e) {
    return json(502, { error: `표지를 저장하지 못했습니다: ${e.message}` });
  }

  return json(201, { path: `/cover/${boxId.toLowerCase()}/${name}` });
}
