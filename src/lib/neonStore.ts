import { isPaperId, type PaperId } from '../design/colors';
import { isTypeId, type TypeId } from '../design/typewriters';
import { forgetAuthProxy, neon, onAuthProxy, useAuthProxy } from './neon';
import type { BoxStore } from './store';
import type {
  BoxSummary, Envelope, LengthBucket, Member, Session, Volume, VolumePage,
} from './types';

const asPaper = (v: unknown): PaperId => (isPaperId(v) ? v : 'ivory');
const asType = (v: unknown): TypeId => (isTypeId(v) ? v : 'steel');
const asBucket = (v: unknown): LengthBucket =>
  v === 'medium' || v === 'long' ? v : 'short';

const errCode = (e: unknown): string => {
  if (typeof e !== 'object' || e === null) return '';
  const c = (e as { code?: unknown }).code;
  return typeof c === 'string' ? c : '';
};

/**
 * 어댑터가 "세션을 못 찾았다" 고 할 때.
 *
 * 이건 자격 증명이 틀렸다는 뜻이 **아니다**. 어댑터(0.5.0-beta)는 로그인·가입
 * 요청이 200 으로 성공한 **뒤에** `getSession()` 을 한 번 더 부르고, 그게 비어
 * 오면 이 오류로 실패시킨다. 즉 비밀번호는 맞았는데 세션이 이 브라우저에
 * 남지 않은 상태다.
 */
const isSessionMissing = (e: unknown): boolean => errCode(e) === 'session_not_found';

/**
 * 가입 요청이 여기서 끊겼다면 계정은 아직 만들어지지 않았다.
 * 되살리려고 로그인을 시도할 이유가 없다 (시도 횟수만 축낸다).
 */
const NOT_CREATED: ReadonlySet<string> = new Set([
  'weak_password', 'email_address_invalid', 'validation_failed', 'bad_json',
  'user_already_exists', 'email_exists', 'invalid_credentials',
  'feature_not_supported', 'over_request_rate_limit', 'signup_disabled',
]);

/**
 * 자격은 통과했는데 세션이 이 브라우저에 남지 않는 경우.
 *
 * 로그인 서버는 다른 사이트(`*.neon.tech`)에 있고, 세션은 그 사이트의 쿠키로
 * 유지된다. 브라우저가 크로스 사이트 쿠키를 막으면 로그인은 성공해도 그 다음
 * 조회가 늘 빈손으로 돌아온다 — 새로고침해도 마찬가지다.
 *
 * 그래서 앱은 먼저 로그인만 우리 주소 밑으로 돌려 다시 해 본다
 * (`functions/auth/[[path]].js`). 이 오류는 **그것마저 통하지 않았을 때**만
 * 나온다. 그러니 브라우저 설정을 바꾸라는 말은 하지 않는다 — 이미 그 설정을
 * 건드리지 않는 길로 시도해 본 뒤다.
 *
 * 문장을 여기서 직접 만든다. errors.ts 는 한국어 문장을 그대로 흘려보내므로,
 * 가입에서 온 것과 로그인에서 온 것을 다르게 말할 수 있다.
 */
const notStored = (opening: string, next: string): Error => Object.assign(
  new Error(`${opening} 이 브라우저에 로그인 상태가 남지 않습니다. ${next}`),
  { code: 'session_not_stored' },
);

interface MemberRow {
  user_id: string;
  paper_color: string;
  type_color: string;
  joined_at: string;
  profiles: { display_name: string } | null;
}

/** Neon Auth 세션의 사용자. SupabaseAuthAdapter 가 이 모양으로 맞춰 준다. */
interface AuthUser {
  readonly id: string;
  readonly email?: string | undefined;
  readonly user_metadata?: Readonly<Record<string, unknown>> | undefined;
}
interface AuthSession { readonly user: AuthUser }

/** 가입 때 넘긴 표시 이름이 Better Auth 의 `name` 을 지나 metadata 에 실려 온다. */
function metaName(user: AuthUser): string {
  const m = user.user_metadata ?? {};
  for (const k of ['displayName', 'display_name', 'name', 'full_name']) {
    const v = m[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 12);
  }
  return '';
}

/** 세션이 안 남을 때 갈아탈 길. 평소에는 `neon.ts` 의 것을 쓴다. */
interface ProxyRoute {
  /** 이미 그 길로 붙어 있는가. */
  on: () => boolean;
  /** 그 길로 붙은 새 클라이언트. */
  use: () => ReturnType<typeof neon>;
  /** 그 길도 소용없었다 — 다음에는 원래 길에서 시작한다. */
  forget: () => void;
}

/**
 * @param client 시험에서만 넘긴다. 평소에는 `neon()` 한 대를 그대로 쓴다.
 *   세션이 언제 알려지는지는 눈으로 봐서는 모르는 종류의 규칙이라
 *   (`tools/auth-check.mjs`) 클라이언트를 갈아 끼울 자리를 하나 열어 둔다.
 * @param route 세션이 안 남을 때 갈아탈 길. 시험에서만 바꿔 끼운다.
 */
export function createNeonStore(
  client?: ReturnType<typeof neon>,
  route: ProxyRoute = { on: onAuthProxy, use: useAuthProxy, forget: forgetAuthProxy },
): BoxStore {
  let db = client ?? neon();

  let session: Session | null = null;
  const listeners = new Set<(s: Session | null) => void>();

  /**
   * Neon Auth 사용자와 profiles 를 합쳐 세션을 만든다. 이름은 profiles 가 정본이다.
   *
   * Supabase 에서는 auth.users 트리거가 프로필을 만들어 줬다. Neon Auth 의 사용자
   * 표는 손댈 수 없으므로(D14), 프로필이 없으면 여기서 ensure_profile() 을 부른다.
   * 가입 직후 첫 hydrate 에서 한 번 만들어지고, 그 뒤로는 select 한 번으로 끝난다.
   */
  async function hydrate(auth: AuthSession | null): Promise<void> {
    if (!auth) { session = null; return; }
    const uid = auth.user.id;
    const wanted = metaName(auth.user);

    const { data } = await db.from('profiles').select('display_name').eq('id', uid).maybeSingle();
    let name = (data as { display_name?: string } | null)?.display_name ?? '';

    if (!name) {
      const made = await db.rpc('ensure_profile', { p_display_name: wanted || null });
      name = typeof made.data === 'string' && made.data ? made.data : (wanted || '이름 없음');
    }

    session = { userId: uid, email: auth.user.email ?? '', displayName: name };
  }
  const emit = () => listeners.forEach((cb) => cb(session));

  /** 인증 결과를 세션에 반영하고 알린다. */
  const apply = async (auth: AuthSession | null): Promise<void> => {
    await hydrate(auth);
    emit();
  };

  /**
   * **다른 탭**에서 로그인·로그아웃했을 때만 온다.
   *
   * Neon 어댑터(@neondatabase/auth 0.5.0-beta)의 `onAuthStateChange` 는
   * BroadcastChannel 위에 얹혀 있고, 자기 탭이 보낸 메시지는 `clientId` 로
   * 걸러 낸다. 그래서 **내가 로그인한 탭에는 이 콜백이 오지 않는다** —
   * 여기에 기대면 로그인해도 화면이 그대로이고 새로고침해야 들어가진다.
   *
   * 그래서 내 탭의 변화는 아래 signIn / signUp / signOut 이 직접 반영한다.
   * 이 구독은 다른 탭과 보조를 맞추는 몫만 맡는다.
   *
   * 클라이언트를 갈아타면 구독도 새 클라이언트에 다시 건다.
   */
  const watchOtherTabs = (): void => {
    db.auth.onAuthStateChange((_event, auth) => {
      void apply(auth ?? null);
    });
  };

  /**
   * 로그인하고 세션을 돌려준다. 없으면 null — 던지지 않는다.
   *
   * 어댑터가 `session_not_found` 로 실패해도 한 번 더 직접 물어본다. 그 오류는
   * 자격이 틀렸다는 뜻이 아니라 세션 조회가 빈손이었다는 뜻이고, 쿠키가 막 심긴
   * 직후라 한 박자 늦게 잡히는 경우가 있다. 자격이 틀린 경우(`invalid_credentials`
   * 등)는 그대로 올려 보낸다.
   */
  const login = async (mail: string, password: string): Promise<AuthSession | null> => {
    const { data, error } = await db.auth.signInWithPassword({ email: mail, password });
    if (!error && data.session) return data.session;
    if (error && !isSessionMissing(error)) throw error;
    const again = await db.auth.getSession();
    return again.data.session ?? null;
  };

  /**
   * 로그인하고, 세션이 남지 않으면 **길을 바꿔 한 번 더** 해 본다.
   *
   * 세션이 안 잡히는 이유는 거의 언제나 브라우저가 다른 사이트의 쿠키를
   * 막고 있어서다(사파리의 크로스 사이트 추적 방지가 기본으로 켜져 있다).
   * 그럴 때 로그인만 우리 주소 밑으로 돌리면 쿠키가 퍼스트파티가 되어
   * 그 차단과 무관해진다 — 브라우저 설정을 바꾸라고 할 일이 아니다.
   *
   * 평소 경로는 건드리지 않는다. 이미 세션이 잡히는 사람은 첫 줄에서 끝난다.
   */
  const loginMaybeProxy = async (mail: string, password: string): Promise<AuthSession | null> => {
    const first = await login(mail, password);
    if (first || route.on()) return first;
    db = route.use();
    watchOtherTabs();
    try {
      return await login(mail, password);
    } catch {
      // 바꾼 길에서 난 오류는 그대로 내보내지 않는다. 중계가 배포되지 않았다면
      // 404 가 오는데, 그건 "가입되지 않은 이메일" 로 옮겨져 엉뚱한 말이 된다.
      // 여기서는 세션을 못 얻었다는 사실만 알리고, 부른 쪽이 사정을 말한다.
      return null;
    }
  };

  const booted = (async () => {
    const { data } = await db.auth.getSession();
    await apply(data.session ?? null);
  })();

  /**
   * 표지 저장소가 실제로 붙어 있는가.
   *
   * R2 버킷을 묶지 않으면 업로드 함수가 503 을 돌려준다. 그걸 모른 채 사진
   * 칸을 내주면, 사용자는 함께 읽기까지 다 끝낸 **뒤에** 표지에서 막힌다 —
   * 되돌릴 수 없는 자리에서 처음 알게 되는 셈이다. 그래서 미리 한 번 묻는다.
   *
   * 경로가 없는 `/cover/` 는 묶여 있으면 204, 아니면 503 이다. **204 만** 참으로
   * 읽는다 — 함수가 아예 배포되지 않았다면 Cloudflare 가 SPA 로 떨어뜨려 200 을
   * 주는데, 그걸 "된다" 로 읽으면 같은 자리에서 또 막힌다. 몸통이 없어 값싸고,
   * 부팅을 붙잡지 않는다 — 의식이 열릴 때쯤이면 이미 답이 와 있다.
   */
  let coversReady = false;
  void (async () => {
    try {
      const res = await fetch(`${location.origin}/cover/`, { method: 'HEAD' });
      coversReady = res.status === 204;
    } catch { coversReady = false; }
  })();

  watchOtherTabs();

  /**
   * PostgrestError 를 그대로 던진다. 문구 변환은 errors.ts 가 한 곳에서 한다.
   *
   * .single() 은 행이 없으면 error 를 채우므로, 여기를 지나온 값은 null 이 아니다.
   * NonNullable 로 좁혀서 호출부마다 non-null 단언을 흩뿌리지 않는다.
   */
  const check = <T,>(res: { data: T; error: unknown }): NonNullable<T> => {
    if (res.error) throw res.error;
    if (res.data == null) throw new Error('데이터를 불러오지 못했습니다.');
    return res.data;
  };

  const requireSession = (): Session => {
    if (!session) throw new Error('로그인이 필요합니다.');
    return session;
  };

  return {
    getSession: () => session,
    onSessionChange(cb) { listeners.add(cb); cb(session); return () => listeners.delete(cb); },
    ready: () => booted,

    /**
     * 사진 표지를 내줄지. Neon 에는 저장소가 없어 (D14) 한동안 색만 냈다.
     * 지금은 우리 주소 밑의 업로드 함수(`functions/cover/[[path]].js`)가 R2 에
     * 대신 써 준다. 그 버킷이 실제로 묶여 있을 때만 참이다.
     */
    get canUploadCover() { return coversReady; },

    async signUp({ email, password, displayName }) {
      const name = displayName.trim().slice(0, 12);
      if (!name) throw new Error('표시 이름을 입력해 주세요.');
      const mail = email.trim().toLowerCase();

      // displayName 은 Better Auth 의 name 으로 실려 가고, 첫 hydrate 에서
      // ensure_profile() 이 그것으로 프로필을 세운다.
      const made = await db.auth.signUp({
        email: mail, password, options: { data: { displayName: name } },
      });

      // 메일 확인을 요구하도록 켜 두면 사용자만 생기고 세션은 없다.
      let session_: AuthSession | null = made.error ? null : (made.data.session ?? null);

      if (made.error) {
        /**
         * **계정은 만들어졌는데 그 뒤에서 끊긴 경우.**
         *
         * 어댑터는 사용자를 만든 직후 getSession() 을 부르고, 그게 비어 오면
         * session_not_found 를 던진다. 세션을 서버가 저장하지 못하면
         * internal_error 로 온다. 어느 쪽이든 계정은 남는다 — 그대로 흘려보내면
         * 다시 가입할 때 "이미 가입된 이메일" 이고, 로그인 탭에서도 못 들어가면
         * 어느 문도 열리지 않는 막다른 길이 된다.
         *
         * 그래서 계정이 만들어졌을 수 있는 오류에서는 방금 그 자격으로 바로
         * 로그인해 본다. 되면 가입이 성공한 것이다.
         */
        if (NOT_CREATED.has(errCode(made.error))) throw made.error;
        try {
          session_ = await loginMaybeProxy(mail, password);
        } catch {
          throw made.error;   // 되살리기도 실패했다 — 원래 오류를 그대로 보여준다
        }
        // 계정은 섰는데 세션이 이 브라우저에 남지 않는다. 여기서 멈추면 사용자는
        // 무엇이 막혔는지 모른 채 "문제가 생겼습니다" 만 본다.
        if (!session_) { route.forget(); throw notStored('계정은 만들었지만', '다른 브라우저에서 로그인해 주세요.'); }
      }

      await apply(session_);
      return { needsConfirmation: session_ === null };
    },

    async signIn({ email, password }) {
      const session_ = await loginMaybeProxy(email.trim().toLowerCase(), password);
      // 비밀번호가 틀렸으면 login() 이 이미 던졌다. 여기까지 와서 비어 있다는 것은
      // 자격은 통과했는데 세션이 이 브라우저에 남지 않는다는 뜻이다.
      if (!session_) { route.forget(); throw notStored('비밀번호는 맞았지만', '다른 브라우저에서 다시 시도해 주세요.'); }
      // 돌려받은 세션을 바로 반영한다. onAuthStateChange 를 기다리면 내 탭에는
      // 영영 오지 않아, 화면이 로그인 폼으로 되돌아간다.
      await apply(session_);
    },

    async requestPasswordReset(email) {
      const { error } = await db.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        // 메일 링크는 서버를 한 번 거쳐 이 주소로 ?token=… 을 달고 돌아온다.
        // 이 주소가 Auth → Configuration → Domains 에 없으면 서버가 거른다.
        redirectTo: `${location.origin}/`,
      });
      if (error) throw error;
    },

    async resetPassword({ token, newPassword }) {
      // 어댑터에는 이걸 끝내는 문이 없다 (0.5.0-beta 는 보내는 쪽만 감쌌다).
      // 그래서 밑에 깔린 Better Auth 클라이언트를 직접 부른다.
      const { error } = await db.auth.getBetterAuthInstance()
        .resetPassword({ token, newPassword });
      if (error) throw error;
    },

    /**
     * 여기로는 오지 않는다. 체험 모드는 브라우저 안에서만 도는 memoryStore 가
     * 맡고, guestStore 가 그쪽으로 돌린다 (D14). Neon 의 anonymous 역할은 사용자
     * id 가 없어 — 전보를 쓸 수도, 전보함을 만들 수도 없다.
     */
    async enterAsGuest() {
      throw new Error('체험 모드를 열지 못했습니다.');
    },

    async signOut() {
      const { error } = await db.auth.signOut();
      if (error) throw error;
      // 나간 것은 서버가 확정했다. 다시 물어볼 것이 없으므로 바로 비운다.
      session = null;
      emit();
    },

    async updateDisplayName(name) {
      const me = requireSession();
      const safe = name.trim().slice(0, 12);
      if (!safe) throw new Error('표시 이름을 입력해 주세요.');
      const { error } = await db.from('profiles').update({ display_name: safe }).eq('id', me.userId);
      if (error) throw error;
      session = { ...me, displayName: safe };
      emit();
    },

    /**
     * 내 전보함 목록.
     *
     * **인원수를 따로 세지 않는다.** 전에는 전보함을 먼저 받고 `box_members` 를
     * 한 번 더 물어 세었는데, 그 집계에 전보함이 없으면 `?? 1` 로 메꿨다.
     * 세지 못한 것을 「1명」 이라고 말해 버리는 자리였다 — 전환 메뉴가 세 사람이
     * 든 전보함을 1명이라고 한 화면이 실제로 있었다. 같은 화면의 이름 줄은
     * `getBox()` 로 세 명을 보여 주고 있었으니, 한 화면이 두 소리를 낸 것이다.
     *
     * 그래서 `boxes` 에서 시작해 참여자를 곁들여 받는다. `boxes_read` 가 이미
     * 내가 든 전보함만 돌려주므로 조건을 따로 걸 필요가 없고, 참여자는 그
     * 전보함의 행 전부다 (`members_read`). 세는 자리와 읽는 자리가 하나가 되어
     * 메꿀 일이 없어진다.
     */
    async listBoxes() {
      const me = requireSession();
      const rows = check(await db
        .from('boxes')
        .select('id, name, invite_code, current_vol, sealed, box_members(user_id, type_color, joined_at)'));

      const boxes = (rows ?? []) as unknown as {
        id: string; name: string; invite_code: string; current_vol: number; sealed: boolean;
        box_members: { user_id: string; type_color: string; joined_at: string }[];
      }[];

      return boxes
        .map((b) => ({ b, mine: b.box_members?.find((m) => m.user_id === me.userId) }))
        // 내가 없는 전보함은 애초에 오지 않는다. 그래도 와 버렸다면 내 목록이 아니다.
        .filter((x) => x.mine !== undefined)
        .sort((x, y) => x.mine!.joined_at.localeCompare(y.mine!.joined_at))
        .map<BoxSummary>(({ b, mine }) => ({
          id: b.id,
          name: b.name,
          inviteCode: b.invite_code,
          currentVol: b.current_vol,
          memberCount: b.box_members.length,
          myType: asType(mine!.type_color),
          sealed: b.sealed,
        }));
    },

    async getBox(boxId) {
      const me = requireSession();
      const box = check(await db
        .from('boxes')
        .select('id, name, invite_code, owner_id, current_vol, sealed, reading_started_at')
        .eq('id', boxId)
        .single()) as {
          id: string; name: string; invite_code: string; owner_id: string;
          current_vol: number; sealed: boolean; reading_started_at: string | null;
        };

      const rows = check(await db
        .from('box_members')
        .select('user_id, paper_color, type_color, joined_at, profiles(display_name)')
        .eq('box_id', boxId)
        .order('joined_at', { ascending: true })) as unknown as MemberRow[] | null;

      const list = rows ?? [];
      const mine = list.find((m) => m.user_id === me.userId);

      // 방장을 앞으로, 나머지는 참여 순서. (§5 전보함 전환 바)
      const members = list
        .map<Member>((m) => ({
          userId: m.user_id,
          displayName: m.profiles?.display_name ?? '이름 없음',
          paper: asPaper(m.paper_color),
          joinedAt: m.joined_at,
          isOwner: m.user_id === box.owner_id,
          isMe: m.user_id === me.userId,
        }))
        .sort((a, b) => (a.isOwner === b.isOwner ? a.joinedAt.localeCompare(b.joinedAt) : a.isOwner ? -1 : 1));

      return {
        id: box.id,
        name: box.name,
        inviteCode: box.invite_code,
        ownerId: box.owner_id,
        currentVol: box.current_vol,
        sealed: box.sealed,
        readingStartedAt: box.reading_started_at,
        memberCount: members.length,
        myPaper: asPaper(mine?.paper_color),
        myType: asType(mine?.type_color),
        members,
      };
    },

    async createBox({ name, paper, type, sealed }) {
      const row = check(await db.rpc('create_box', {
        p_name: name.trim().slice(0, 20), p_paper: paper, p_type: type, p_sealed: sealed,
      })) as { box_id: string; box_name: string; invite_code: string }[] | null;
      const first = row?.[0];
      if (!first) throw new Error('전보함을 만들지 못했습니다.');
      return { boxId: first.box_id, inviteCode: first.invite_code };
    },

    async joinBox({ code, paper, type }) {
      const row = check(await db.rpc('join_box', {
        p_code: code, p_paper: paper, p_type: type,
      })) as { box_id: string; box_name: string }[] | null;
      const first = row?.[0];
      if (!first) throw new Error('해당 코드의 전보함을 찾을 수 없습니다.');
      return { boxId: first.box_id, name: first.box_name };
    },

    async renameBox(boxId, name) {
      const safe = name.trim().slice(0, 20);
      if (!safe) throw new Error('전보함 이름을 입력해 주세요.');
      const { error } = await db.from('boxes').update({ name: safe }).eq('id', boxId);
      if (error) throw error;
    },

    async setMyColors(boxId, colors) {
      const me = requireSession();
      const patch: Record<string, string> = {};
      if (colors.paper) patch['paper_color'] = colors.paper;
      if (colors.type) patch['type_color'] = colors.type;
      if (Object.keys(patch).length === 0) return;
      const { error } = await db.from('box_members').update(patch)
        .eq('box_id', boxId).eq('user_id', me.userId);
      if (error) throw error;
    },

    async leaveBox(boxId) {
      const { error } = await db.rpc('leave_box', { p_box_id: boxId });
      if (error) throw error;
    },

    async listEnvelopes(boxId, vol) {
      // 봉인을 우회하지 않는다. 남의 이번 권 전보는 이 뷰로만 읽는다.
      let q = db.from('telegram_envelopes')
        .select('id, box_id, author_id, vol, created_at, unsealed, body, length_bucket')
        .eq('box_id', boxId)
        .order('created_at', { ascending: false });
      if (vol !== undefined) q = q.eq('vol', vol);
      const rows = check(await q) as {
        id: string; box_id: string; author_id: string; vol: number;
        created_at: string; unsealed: boolean; body: string | null; length_bucket: string;
      }[] | null;
      return (rows ?? []).map<Envelope>((r) => ({
        id: r.id, boxId: r.box_id, authorId: r.author_id, vol: r.vol,
        createdAt: r.created_at, unsealed: r.unsealed, body: r.body,
        lengthBucket: asBucket(r.length_bucket),
      }));
    },

    async sendTelegram(boxId, body) {
      const me = requireSession();
      const text = body.trim();
      if (!text) throw new Error('전할 말을 입력해 주세요.');
      const box = check(await db.from('boxes').select('current_vol').eq('id', boxId).single()) as
        { current_vol: number };
      const { error } = await db.from('telegrams').insert({
        box_id: boxId, author_id: me.userId, body: text, vol: box.current_vol,
      });
      if (error) throw error;
    },

    async deleteTelegram(id) {
      const { error } = await db.from('telegrams')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id).is('deleted_at', null);
      if (error) throw error;
    },

    async beginReading(boxId) {
      const { error } = await db.rpc('begin_reading', { p_box_id: boxId });
      if (error) throw error;
    },

    async closeVolume(boxId, input) {
      const id = check(await db.rpc('close_volume', {
        p_box_id: boxId,
        p_title: input.title.trim().slice(0, 20),
        p_cover_kind: input.coverKind,
        p_cover_value: input.coverValue,
        p_read_together: input.readTogether,
      })) as string | null;
      if (!id) throw new Error('제본에 실패했습니다.');
      return id;
    },

    async listVolumes(boxId) {
      const rows = check(await db.from('volumes')
        .select('id, box_id, vol, title, cover_kind, cover_value, period_start, period_end, page_count, read_together, closed_at')
        .eq('box_id', boxId)
        .order('vol', { ascending: false })) as {
          id: string; box_id: string; vol: number; title: string;
          cover_kind: string; cover_value: string; period_start: string; period_end: string;
          page_count: number; read_together: boolean; closed_at: string;
        }[] | null;
      return (rows ?? []).map<Volume>((v) => ({
        id: v.id, boxId: v.box_id, vol: v.vol, title: v.title,
        coverKind: v.cover_kind === 'photo' ? 'photo' : 'color',
        coverValue: v.cover_value,
        periodStart: v.period_start, periodEnd: v.period_end,
        pageCount: v.page_count, readTogether: v.read_together, closedAt: v.closed_at,
      }));
    },

    async getVolumePages(volumeId) {
      const rows = check(await db.from('volume_pages')
        .select('ord, author_id, author_name, paper_color, body, sent_at')
        .eq('volume_id', volumeId)
        .order('ord', { ascending: true })) as {
          ord: number; author_id: string | null; author_name: string;
          paper_color: string; body: string; sent_at: string;
        }[] | null;
      return (rows ?? []).map<VolumePage>((p) => ({
        ord: p.ord, authorId: p.author_id, authorName: p.author_name,
        paperColor: asPaper(p.paper_color), body: p.body, sentAt: p.sent_at,
      }));
    },

    /**
     * 표지 사진을 우리 주소 밑으로 올린다 (`functions/cover/[[path]].js`).
     *
     * 토큰을 실어 보내면 그쪽이 **그 토큰으로** Data API 에 물어 멤버인지 본다.
     * 권한 규칙을 클라이언트가 정하지 않는다 — RLS 가 이미 아는 것을 다시 쓰지
     * 않기 위해서다. 돌아오는 것은 경로 하나이고, 그것이 `cover_value` 가 된다
     * (데이터 규칙 3: base64 를 행에 넣지 않는다).
     */
    async uploadCover(boxId, file) {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      const token = (data.session as { access_token?: string } | null)?.access_token;
      if (!token) throw new Error('로그인이 필요합니다.');

      let res: Response;
      try {
        res = await fetch(`${location.origin}/cover/${boxId}`, {
          method: 'PUT',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'image/jpeg' },
          body: file,
        });
      } catch {
        throw new Error('표지를 올리지 못했습니다. 연결을 확인해 주세요.');
      }

      const body = await res.json().catch(() => null) as { path?: string; error?: string } | null;
      if (!res.ok || !body?.path) {
        throw new Error(body?.error ?? `표지를 올리지 못했습니다. (HTTP ${res.status})`);
      }
      return body.path;
    },

    coverUrl: (path) => path,
  };
}
