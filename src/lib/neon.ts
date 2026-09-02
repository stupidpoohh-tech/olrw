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

function make() {
  // 주소 하나만 받는 형태(createClient(url, {...}))는 기본 어댑터 말고는 타입이
  // 맞지 않는다. 유도만 빌려 쓰고 두 주소를 직접 넘긴다.
  const derived = defaultDeriveNeonUrls(url as string);
  return createClient({
    auth: { url: derived.auth, adapter: SupabaseAuthAdapter() },
    dataApi: { url: derived.dataApi },
  });
}

let client: Client | null = null;

export function neon(): Client {
  if (!hasNeonConfig) throw new Error('VITE_NEON_URL 이 설정되지 않았습니다.');
  client ??= make();
  return client;
}
