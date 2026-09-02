/**
 * 세션이 **제때** 알려지는지 본다.
 *
 *   pnpm auth:check
 *
 * 왜 따로 두는가. `ui:check` 들은 전부 memoryStore 로 돈다(환경변수가 없으니).
 * 그래서 Neon 어댑터 쪽 계약이 깨져도 하나도 실패하지 않는다 — 실제로
 * 로그인하면 "들어가는 중…" 뒤에 로그인 화면이 다시 서고 새로고침해야
 * 들어가지는 버그가 그렇게 통과했다.
 *
 * 원인은 어댑터의 `onAuthStateChange` 가 BroadcastChannel 위에 얹혀 있고
 * **자기 탭이 보낸 메시지는 걸러 낸다**는 것이었다. 로그인한 그 탭에는
 * 콜백이 오지 않는다. 그래서 규칙을 이렇게 못박는다:
 *
 *   signIn / signUp / signOut 은 **resolve 하기 전에** 구독자에게 알린다.
 *
 * 그러려면 밖에서 어떤 이벤트도 오지 않는다고 가정해야 하므로, 여기서 쓰는
 * 가짜 클라이언트는 `onAuthStateChange` 를 **한 번도 부르지 않는다**.
 */
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

/* ── 가짜 Neon 클라이언트 ──────────────────────────────────────────────────
   앱이 실제로 부르는 것만 흉내낸다. 이벤트는 내보내지 않는다. */

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'dada@olrw.test',
  user_metadata: { displayName: 'Dada' },
};
const SESSION = { access_token: 'tok', user: USER };

function fakeClient() {
  let signedIn = false;
  const rpcCalls = [];
  return {
    rpcCalls,
    auth: {
      getSession: async () => ({ data: { session: signedIn ? SESSION : null }, error: null }),
      // 내 탭에는 아무것도 오지 않는다 — 어댑터의 실제 동작이다.
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => {
        signedIn = true;
        return { data: { user: USER, session: SESSION }, error: null };
      },
      signUp: async () => {
        signedIn = true;
        return { data: { user: USER, session: SESSION }, error: null };
      },
      signOut: async () => { signedIn = false; return { error: null }; },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Dada' }, error: null }) }) }),
    }),
    rpc: async (name, args) => { rpcCalls.push([name, args]); return { data: 'Dada', error: null }; },
  };
}

/* ── 실행 ─────────────────────────────────────────────────────────────────── */

/**
 * `neon.ts` 를 빈 껍데기로 갈아 끼운다. 클라이언트는 우리가 직접 넘기므로
 * 진짜 패키지(@neondatabase/neon-js)를 딸려 올 이유가 없다 — 그것까지 묶으면
 * 브라우저 전용 값과 asset import 때문에 번들이 서지 않는다.
 */
const stubNeon = {
  name: 'stub-neon',
  setup(b) {
    b.onResolve({ filter: /^\.\/neon$/ }, () => ({ path: 'neon-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'export const hasNeonConfig = false;'
        + ' export function neon() { throw new Error("시험에서는 클라이언트를 직접 넘긴다"); }',
      loader: 'js',
    }));
  },
};

const bundled = await build({
  entryPoints: [join(ROOT, 'src/lib/neonStore.ts')],
  bundle: true, write: false, format: 'esm', platform: 'neutral',
  plugins: [stubNeon],
  // 타자기 사진·소리는 이 시험과 무관하다. 자리만 비워 둔다.
  loader: { '.webp': 'empty', '.wav': 'empty' },
});
const { createNeonStore } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

for (const [label, act] of [
  ['로그인', (s) => s.signIn({ email: 'dada@olrw.test', password: 'x'.repeat(8) })],
  ['가입', (s) => s.signUp({ email: 'dada@olrw.test', password: 'x'.repeat(8), displayName: 'Dada' })],
]) {
  const client = fakeClient();
  const store = createNeonStore(client);
  await store.ready();

  const seen = [];
  const off = store.onSessionChange((s) => seen.push(s));
  seen.length = 0;   // 구독 즉시 오는 현재 상태는 세지 않는다

  await act(store);

  ok(`${label} 하면 resolve 전에 세션을 알린다`, seen.length > 0 && seen.at(-1) !== null,
    `알림 ${seen.length}회`);
  ok(`${label} 뒤 getSession() 이 사람을 안다`, store.getSession()?.displayName === 'Dada',
    JSON.stringify(store.getSession()));

  seen.length = 0;
  await store.signOut();
  ok(`${label} 뒤 로그아웃하면 그 자리에서 비운다`, seen.length > 0 && seen.at(-1) === null,
    `알림 ${seen.length}회`);
  ok(`${label} 뒤 로그아웃하면 getSession() 이 null`, store.getSession() === null);
  off();
}

/* 프로필이 없는 첫 로그인 — ensure_profile 로 이름을 세운다. */
{
  const client = fakeClient();
  client.from = () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  });
  const store = createNeonStore(client);
  await store.ready();
  await store.signIn({ email: 'dada@olrw.test', password: 'x'.repeat(8) });
  ok('프로필이 없으면 ensure_profile 로 세운다',
    client.rpcCalls.some(([n, a]) => n === 'ensure_profile' && a?.p_display_name === 'Dada'),
    JSON.stringify(client.rpcCalls));
  ok('그 이름이 세션에 실린다', store.getSession()?.displayName === 'Dada');
}

console.log(failed ? `\n━━━ ${failed}건 실패 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
