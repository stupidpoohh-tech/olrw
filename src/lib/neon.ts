import {
  createClient, defaultDeriveNeonUrls, SupabaseAuthAdapter,
} from '@neondatabase/neon-js';

/**
 * Neon 클라이언트 한 대.
 *
 * 주소는 하나만 넣는다. Neon 이 여기에서 인증 주소와 Data API 주소를 각각 유도한다
 * (`…neonauth…/auth`, `…apirest…/rest/v1`). Supabase 때와 달리 익명 키가 없다 —
 * 권한은 전적으로 JWT 와 RLS 가 정한다.
 *
 * SupabaseAuthAdapter 를 끼운다. Neon Auth 는 Better Auth 위에 서 있지만 이 어댑터가
 * `signUp` `signInWithPassword` `onAuthStateChange` 같은 익숙한 이름으로 감싸 준다.
 * 질의 쪽(`from` `rpc`)은 PostgREST 라 원래 같다.
 */
const url = import.meta.env['VITE_NEON_URL'];

/** 환경변수가 없으면 memoryStore 로 돈다. 개발 중 빈 화면 대신 동작하는 앱을 본다. */
export const hasNeonConfig = Boolean(url);

type Client = ReturnType<typeof make>;

/**
 * 로그인만 우리 주소 밑으로 돌리는 길 (`functions/auth/[[path]].js`).
 *
 * 로그인 서버는 다른 사이트(`*.neon.tech`)에 있고 세션은 그 사이트의 쿠키로
 * 유지된다. 사파리는 크로스 사이트 추적 방지를 기본으로 켜 두고 그런 쿠키를
 * 막는다 — 비밀번호가 맞아도 다음 확인이 빈손으로 돌아온다. 이 길로 가면
 * 브라우저가 보는 상대가 우리 도메인 하나뿐이라 그 차단과 무관해진다.
 *
 * 평소에는 쓰지 않는다. 직접 붙기가 세션을 남기지 못한 그 사람에게만,
 * 그 자리에서 갈아탄다 (`neonStore.ts`).
 */
const PROXY_PATH = '/auth';
const PROXY_KEY = 'olrw.authProxy';

const proxyRemembered = (): boolean => {
  try { return localStorage.getItem(PROXY_KEY) === '1'; } catch { return false; }
};

function make(viaProxy: boolean) {
  // 주소 하나만 받는 형태(createClient(url, {...}))는 기본 어댑터 말고는 타입이
  // 맞지 않는다. 유도만 빌려 쓰고 두 주소를 직접 넘긴다.
  const derived = defaultDeriveNeonUrls(url as string);
  // 전보를 읽고 쓰는 쪽(Data API)은 쿠키가 아니라 JWT 로 다니므로 갈아탈 것이
  // 없다. 추적 방지에 걸리는 것은 로그인 쪽뿐이다.
  return createClient({
    auth: {
      url: viaProxy ? `${location.origin}${PROXY_PATH}` : derived.auth,
      adapter: SupabaseAuthAdapter(),
    },
    dataApi: { url: derived.dataApi },
  });
}

let client: Client | null = null;
let viaProxy = false;

export function neon(): Client {
  if (!hasNeonConfig) throw new Error('VITE_NEON_URL 이 설정되지 않았습니다.');
  if (!client) {
    viaProxy = proxyRemembered();
    client = make(viaProxy);
  }
  return client;
}

/** 이미 그 길로 붙어 있는가. 두 번 갈아타지 않으려고 본다. */
export function onAuthProxy(): boolean { return viaProxy; }

/**
 * 로그인만 우리 주소 밑으로 돌린 새 클라이언트로 갈아탄다.
 * 한 번 갈아타면 이 브라우저는 다음 방문부터 처음부터 그 길로 간다.
 */
export function useAuthProxy(): Client {
  viaProxy = true;
  try { localStorage.setItem(PROXY_KEY, '1'); } catch { /* 저장 못 해도 이번 세션은 간다 */ }
  client = make(true);
  return client;
}

/**
 * 그 길도 소용없었다면 기억을 지운다.
 *
 * 지우지 않으면 이 브라우저는 영영 그 길로만 간다 — 프록시 쪽이 고장난
 * 경우에도 직접 붙어 볼 기회가 사라진다. 다음 시도는 원래 길에서 시작한다.
 */
export function forgetAuthProxy(): void {
  try { localStorage.removeItem(PROXY_KEY); } catch { /* 못 지워도 이번엔 알렸다 */ }
}
