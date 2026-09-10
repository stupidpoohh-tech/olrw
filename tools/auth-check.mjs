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
  email: 'ann@olrw.test',
  user_metadata: { displayName: 'Ann' },
};
const SESSION = { access_token: 'tok', user: USER };

function fakeClient() {
  let signedIn = false;
  const rpcCalls = [];
  const calls = { signIn: 0, signUp: 0, getSession: 0 };
  return {
    rpcCalls,
    calls,
    auth: {
      getSession: async () => {
        calls.getSession++;
        return { data: { session: signedIn ? SESSION : null }, error: null };
      },
      // 내 탭에는 아무것도 오지 않는다 — 어댑터의 실제 동작이다.
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => {
        calls.signIn++;
        signedIn = true;
        return { data: { user: USER, session: SESSION }, error: null };
      },
      signUp: async () => {
        calls.signUp++;
        signedIn = true;
        return { data: { user: USER, session: SESSION }, error: null };
      },
      signOut: async () => { signedIn = false; return { error: null }; },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Ann' }, error: null }) }) }),
    }),
    rpc: async (name, args) => { rpcCalls.push([name, args]); return { data: 'Ann', error: null }; },
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
        + ' export function neon() { throw new Error("시험에서는 클라이언트를 직접 넘긴다"); }'
        + ' export function onAuthProxy() { return false; }'
        + ' export function useAuthProxy() { throw new Error("시험에서는 길도 직접 넘긴다"); }'
        + ' export function forgetAuthProxy() {}',
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
  ['로그인', (s) => s.signIn({ email: 'ann@olrw.test', password: 'x'.repeat(8) })],
  ['가입', (s) => s.signUp({ email: 'ann@olrw.test', password: 'x'.repeat(8), displayName: 'Ann' })],
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
  ok(`${label} 뒤 getSession() 이 사람을 안다`, store.getSession()?.displayName === 'Ann',
    JSON.stringify(store.getSession()));

  seen.length = 0;
  await store.signOut();
  ok(`${label} 뒤 로그아웃하면 그 자리에서 비운다`, seen.length > 0 && seen.at(-1) === null,
    `알림 ${seen.length}회`);
  ok(`${label} 뒤 로그아웃하면 getSession() 이 null`, store.getSession() === null);
  off();
}

/* 계정은 만들어졌는데 세션만 못 받아온 가입.
   어댑터는 사용자를 만든 직후 getSession() 을 부르고, 비어 오면 session_not_found
   를 던진다. 그때 화면에 "가입 실패" 를 띄우면 계정은 남고 문은 닫힌다 —
   다시 가입하면 "이미 가입된 이메일", 로그인도 안 되면 막다른 길이다. */
{
  const client = fakeClient();
  let tried = 0;
  client.auth.signUp = async () => {
    tried++;
    return { data: { user: null, session: null },
             error: { code: 'session_not_found', message: 'Failed to retrieve user session' } };
  };
  const store = createNeonStore(client);
  await store.ready();
  let threw = null;
  try {
    await store.signUp({ email: 'ann@olrw.test', password: 'x'.repeat(8), displayName: 'Ann' });
  } catch (e) { threw = e; }
  ok('세션만 못 받아온 가입은 그 자리에서 로그인해 살린다', threw === null,
    threw ? String(threw.message ?? threw) : `signUp 1회 · 세션 ${store.getSession() ? '있음' : '없음'}`);
  ok('그러고 나면 들어가 있다', store.getSession()?.displayName === 'Ann');
  void tried;
}

/* 그 자리 로그인마저 실패하면 원래 오류를 그대로 보여준다 — 조용히 삼키지 않는다. */
{
  const client = fakeClient();
  client.auth.signUp = async () => ({ data: { user: null, session: null },
    error: { code: 'session_not_found', message: 'Failed to retrieve user session' } });
  client.auth.signInWithPassword = async () => ({ data: { user: null, session: null },
    error: { code: 'invalid_credentials', message: 'Invalid email or password' } });
  const store = createNeonStore(client);
  await store.ready();
  let code = '';
  try {
    await store.signUp({ email: 'ann@olrw.test', password: 'x'.repeat(8), displayName: 'Ann' });
  } catch (e) { code = e?.code ?? ''; }
  ok('되살리기도 실패하면 원래 오류가 올라온다', code === 'session_not_found', `code = ${code}`);
}

/* 프로필이 없는 첫 로그인 — ensure_profile 로 이름을 세운다. */
{
  const client = fakeClient();
  client.from = () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
  });
  const store = createNeonStore(client);
  await store.ready();
  await store.signIn({ email: 'ann@olrw.test', password: 'x'.repeat(8) });
  ok('프로필이 없으면 ensure_profile 로 세운다',
    client.rpcCalls.some(([n, a]) => n === 'ensure_profile' && a?.p_display_name === 'Ann'),
    JSON.stringify(client.rpcCalls));
  ok('그 이름이 세션에 실린다', store.getSession()?.displayName === 'Ann');
}

/* ═══ 세션이 이 브라우저에 남지 않을 때 ═══════════════════════════════════
   어댑터(0.5.0-beta)는 로그인·가입 요청이 200 으로 성공한 **뒤에**
   getSession() 을 한 번 더 부르고, 그게 비어 오면 session_not_found 로
   실패시킨다. 로그인 서버는 다른 사이트(*.neon.tech)에 있으므로, 브라우저가
   크로스 사이트 쿠키를 막으면 늘 빈손이 온다 — 비밀번호가 맞아도 못 들어간다.

   그때 "문제가 생겼습니다" 만 뜨면 사용자는 무엇이 막혔는지 알 길이 없다. */

/** 자격은 통과하지만 세션은 끝내 잡히지 않는 클라이언트. */
function noSessionClient() {
  const c = fakeClient();
  c.auth.getSession = async () => { c.calls.getSession++; return { data: { session: null }, error: null }; };
  c.auth.signInWithPassword = async () => {
    c.calls.signIn++;
    return { data: { user: null, session: null },
             error: { code: 'session_not_found', message: 'Failed to retrieve user session' } };
  };
  c.auth.signUp = async () => {
    c.calls.signUp++;
    return { data: { user: null, session: null },
             error: { code: 'session_not_found', message: 'Failed to retrieve user session' } };
  };
  return c;
}

/** 갈아탈 길이 이미 소진된 상태 — 우리 주소 밑으로 돌려도 세션이 안 남는다. */
let forgotten = 0;
const NO_ROUTE = {
  on: () => true,
  use: () => { throw new Error('갈아탈 곳이 없다'); },
  forget: () => { forgotten++; },
};

{
  const client = noSessionClient();
  const store = createNeonStore(client, NO_ROUTE);
  await store.ready();
  let e = null;
  try { await store.signIn({ email: 'ann@olrw.test', password: 'x'.repeat(8) }); }
  catch (err) { e = err; }
  ok('세션이 안 남으면 로그인은 그 사실을 말한다', e?.code === 'session_not_stored',
    `code = ${e?.code} · ${e?.message ?? ''}`);
  ok('그 문장이 무엇을 해 보라고 말한다',
    typeof e?.message === 'string' && e.message.includes('다른 브라우저'), e?.message);
  // 여기까지 왔다는 것은 우리 주소 밑으로 돌려 봐도 안 됐다는 뜻이다.
  // 이제 와서 설정을 끄라고 하면, 이미 그 설정과 무관한 길을 시도한 뒤라 앞뒤가 안 맞는다.
  ok('설정을 끄라고 하지 않는다',
    typeof e?.message === 'string' && !e.message.includes('추적 방지'), e?.message);
  ok('세션은 비어 있다', store.getSession() === null);
}

{
  const client = noSessionClient();
  const store = createNeonStore(client, NO_ROUTE);
  await store.ready();
  let e = null;
  try {
    await store.signUp({ email: 'ann@olrw.test', password: 'x'.repeat(8), displayName: 'Ann' });
  } catch (err) { e = err; }
  ok('세션이 안 남으면 가입도 그 사실을 말한다', e?.code === 'session_not_stored',
    `code = ${e?.code} · ${e?.message ?? ''}`);
  ok('가입 쪽 문장은 계정이 만들어졌다고 알린다',
    typeof e?.message === 'string' && e.message.startsWith('계정은 만들었지만'), e?.message);
}

/* 한 박자 늦게 잡히는 경우 — 어댑터는 실패로 봤지만 곧 세션이 선다.
   여기서 포기하면 멀쩡한 로그인을 실패로 돌려보내게 된다. */
{
  const client = fakeClient();
  let asked = 0;
  client.auth.signInWithPassword = async () => {
    client.calls.signIn++;
    return { data: { user: null, session: null },
             error: { code: 'session_not_found', message: 'Failed to retrieve user session' } };
  };
  client.auth.getSession = async () => {
    client.calls.getSession++;
    return { data: { session: ++asked >= 2 ? SESSION : null }, error: null };
  };
  const store = createNeonStore(client);
  await store.ready();
  let e = null;
  try { await store.signIn({ email: 'ann@olrw.test', password: 'x'.repeat(8) }); }
  catch (err) { e = err; }
  ok('세션이 한 박자 늦게 서면 그대로 들어간다',
    e === null && store.getSession()?.displayName === 'Ann', e ? String(e.message ?? e) : '');
}

/* 가입이 세션 저장에서 끊긴 경우(internal_error). 계정은 이미 섰다 —
   그대로 실패로 돌려보내면 다시 가입할 수도 로그인할 수도 없는 길이 된다. */
{
  const client = fakeClient();
  client.auth.signUp = async () => {
    client.calls.signUp++;
    return { data: { user: null, session: null },
             error: { code: 'internal_error', message: 'Failed to create session' } };
  };
  const store = createNeonStore(client);
  await store.ready();
  let e = null;
  try { await store.signUp({ email: 'ann@olrw.test', password: 'x'.repeat(8), displayName: 'Ann' }); }
  catch (err) { e = err; }
  ok('세션 저장에서 끊긴 가입도 로그인으로 살린다',
    e === null && store.getSession()?.displayName === 'Ann', e ? String(e.message ?? e) : '');
  ok('그때 로그인을 한 번 시도한다', client.calls.signIn === 1, `signIn ${client.calls.signIn}회`);
}

/* 반대로, 계정이 만들어지기 전에 끊긴 오류에서는 로그인을 시도하지 않는다.
   헛수고인 데다 시도 횟수 제한만 축낸다. */
{
  const client = fakeClient();
  client.auth.signUp = async () => {
    client.calls.signUp++;
    return { data: { user: null, session: null },
             error: { code: 'weak_password', message: 'Password too short' } };
  };
  const store = createNeonStore(client);
  await store.ready();
  let code = '';
  try {
    await store.signUp({ email: 'ann@olrw.test', password: 'x'.repeat(8), displayName: 'Ann' });
  } catch (e) { code = e?.code ?? ''; }
  ok('계정이 서기 전에 끊긴 가입은 그대로 알린다', code === 'weak_password', `code = ${code}`);
  ok('그때는 로그인을 시도하지 않는다', client.calls.signIn === 0, `signIn ${client.calls.signIn}회`);
}

/* ═══ 쿠키가 막혔을 때 길을 바꾼다 ═══════════════════════════════════════
   세션이 안 잡히는 이유는 거의 언제나 브라우저가 다른 사이트의 쿠키를 막고
   있어서다. 그럴 때 로그인만 우리 주소 밑(functions/auth)으로 돌리면 쿠키가
   퍼스트파티가 되어 그 차단과 무관해진다.

   여기서 지키는 것은 셋이다.
     1. 세션이 잡히는 사람의 경로는 건드리지 않는다
     2. 안 잡히면 갈아타고 한 번 더 해 본다
     3. 갈아탄 뒤에도 안 되면 그때 사정을 말한다 (무한히 갈아타지 않는다) */

{
  const blocked = noSessionClient();
  const working = fakeClient();
  let switched = 0;
  const route = { on: () => switched > 0, use: () => { switched++; return working; }, forget: () => {} };

  const store = createNeonStore(blocked, route);
  await store.ready();
  let e = null;
  try { await store.signIn({ email: 'ann@olrw.test', password: 'x'.repeat(8) }); }
  catch (err) { e = err; }

  ok('세션이 안 잡히면 길을 바꿔 한 번 더 해 본다', switched === 1, `갈아타기 ${switched}회`);
  ok('그 길로 들어가진다', e === null && store.getSession()?.displayName === 'Ann',
    e ? String(e.message ?? e) : '');
  ok('바꾼 길로 로그인을 한 번만 시도한다', working.calls.signIn === 1,
    `signIn ${working.calls.signIn}회`);
}

{
  const blocked = noSessionClient();
  let switched = 0;
  // 갈아탄 길에서도 세션이 안 잡히는 경우.
  const route = { on: () => switched > 0, use: () => { switched++; return noSessionClient(); }, forget: () => {} };

  const store = createNeonStore(blocked, route);
  await store.ready();
  let e = null;
  try { await store.signIn({ email: 'ann@olrw.test', password: 'x'.repeat(8) }); }
  catch (err) { e = err; }
  ok('갈아탄 뒤에도 안 되면 그때 사정을 말한다', e?.code === 'session_not_stored',
    `code = ${e?.code}`);
  ok('갈아타기는 한 번뿐이다', switched === 1, `갈아타기 ${switched}회`);
}

{
  // 이미 그 길로 붙어 있으면 다시 갈아타지 않는다.
  const blocked = noSessionClient();
  let switched = 0;
  const route = { on: () => true, use: () => { switched++; return fakeClient(); }, forget: () => {} };
  const store = createNeonStore(blocked, route);
  await store.ready();
  let e = null;
  try { await store.signIn({ email: 'ann@olrw.test', password: 'x'.repeat(8) }); }
  catch (err) { e = err; }
  ok('이미 그 길이면 갈아타지 않는다', switched === 0 && e?.code === 'session_not_stored');
}

{
  // 세션이 잡히는 사람은 애초에 갈아탈 일이 없다.
  const client = fakeClient();
  let switched = 0;
  const route = { on: () => false, use: () => { switched++; return client; }, forget: () => {} };
  const store = createNeonStore(client, route);
  await store.ready();
  await store.signIn({ email: 'ann@olrw.test', password: 'x'.repeat(8) });
  ok('잘 되는 사람의 경로는 그대로다', switched === 0 && store.getSession()?.displayName === 'Ann');
}

{
  // 가입도 같은 길을 쓴다. 계정은 이미 만들어졌으므로 여기서 포기하면 막다른 길이다.
  const blocked = noSessionClient();
  const working = fakeClient();
  let switched = 0;
  const route = { on: () => switched > 0, use: () => { switched++; return working; }, forget: () => {} };
  const store = createNeonStore(blocked, route);
  await store.ready();
  let e = null;
  try { await store.signUp({ email: 'ann@olrw.test', password: 'x'.repeat(8), displayName: 'Ann' }); }
  catch (err) { e = err; }
  ok('가입도 길을 바꿔 살린다', e === null && store.getSession()?.displayName === 'Ann',
    e ? String(e.message ?? e) : '');
}

/* 그 길도 소용없었으면 기억을 지운다. 안 지우면 이 브라우저는 영영 그 길로만
   가고, 프록시 쪽이 고장난 경우 직접 붙어 볼 기회가 사라진다. */
ok('길을 바꿔도 안 되면 그 기억을 지운다', forgotten === 2, `지움 ${forgotten}회`);

{
  // 중계가 아직 배포되지 않아 404 가 오는 경우. 그 오류를 그대로 옮기면
  // "가입되지 않은 이메일입니다" 가 떠서, 계정이 있는 사람이 없다는 말을 듣는다.
  const blocked = noSessionClient();
  const notDeployed = fakeClient();
  notDeployed.auth.signInWithPassword = async () => ({
    data: { user: null, session: null },
    error: { code: 'user_not_found', status: 404, message: 'Not Found' },
  });
  notDeployed.auth.getSession = async () => ({ data: { session: null }, error: null });
  let switched = 0;
  const route = {
    on: () => switched > 0,
    use: () => { switched++; return notDeployed; },
    forget: () => {},
  };
  const store = createNeonStore(blocked, route);
  await store.ready();
  let e = null;
  try { await store.signIn({ email: 'ann@olrw.test', password: 'x'.repeat(8) }); }
  catch (err) { e = err; }
  ok('바꾼 길이 없더라도 엉뚱한 말을 하지 않는다', e?.code === 'session_not_stored',
    `code = ${e?.code} · ${e?.message ?? ''}`);
}

console.log(failed ? `\n━━━ ${failed}건 실패 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
