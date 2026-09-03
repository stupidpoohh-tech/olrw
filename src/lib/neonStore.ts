import { isPaperId, type PaperId } from '../design/colors';
import { isTypeId, type TypeId } from '../design/typewriters';
import { neon } from './neon';
import type { BoxStore } from './store';
import type {
  BoxSummary, Envelope, LengthBucket, Member, Session, Volume, VolumePage,
} from './types';

const asPaper = (v: unknown): PaperId => (isPaperId(v) ? v : 'ivory');
const asType = (v: unknown): TypeId => (isTypeId(v) ? v : 'steel');
const asBucket = (v: unknown): LengthBucket =>
  v === 'medium' || v === 'long' ? v : 'short';

/** 어댑터가 "세션을 못 찾았다" 고 할 때. 가입 직후에 이 오류가 자주 온다. */
const isSessionMissing = (e: unknown): boolean =>
  typeof e === 'object' && e !== null
  && (e as { code?: unknown }).code === 'session_not_found';

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

/**
 * @param client 시험에서만 넘긴다. 평소에는 `neon()` 한 대를 그대로 쓴다.
 *   세션이 언제 알려지는지는 눈으로 봐서는 모르는 종류의 규칙이라
 *   (`tools/auth-check.mjs`) 클라이언트를 갈아 끼울 자리를 하나 열어 둔다.
 */
export function createNeonStore(client?: ReturnType<typeof neon>): BoxStore {
  const db = client ?? neon();

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

  const booted = (async () => {
    const { data } = await db.auth.getSession();
    await apply(data.session ?? null);
  })();

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
   */
  db.auth.onAuthStateChange((_event, auth) => {
    void apply(auth ?? null);
  });

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

    /** 표지 사진은 Neon 쪽 저장소가 아직 없다. 색 표지만 고르게 한다. (D14) */
    canUploadCover: false,

    async signUp({ email, password, displayName }) {
      const name = displayName.trim().slice(0, 12);
      if (!name) throw new Error('표시 이름을 입력해 주세요.');
      const mail = email.trim().toLowerCase();

      // displayName 은 Better Auth 의 name 으로 실려 가고, 첫 hydrate 에서
      // ensure_profile() 이 그것으로 프로필을 세운다.
      let data;
      const made = await db.auth.signUp({
        email: mail, password, options: { data: { displayName: name } },
      });

      if (made.error && isSessionMissing(made.error)) {
        /**
         * **계정은 만들어졌는데 세션만 못 받아온 경우.**
         *
         * 어댑터는 사용자를 만든 직후 getSession() 을 부르고, 그게 비어 오면
         * session_not_found 를 던진다. 그대로 흘려보내면 화면에는 "가입 실패" 가
         * 뜨지만 계정은 남는다 — 다시 가입하면 "이미 가입된 이메일" 이고,
         * 로그인 탭에서도 못 들어가면 어느 문도 열리지 않는 막다른 길이 된다.
         *
         * 그래서 방금 만든 그 자격으로 바로 로그인해 본다. 되면 가입이 성공한
         * 것이고, 안 되면 원래 오류를 그대로 보여준다.
         */
        const back = await db.auth.signInWithPassword({ email: mail, password });
        if (back.error) throw made.error;
        data = back.data;
      } else {
        if (made.error) throw made.error;
        data = made.data;
      }

      // 메일 확인을 요구하도록 켜 두면 사용자만 생기고 세션은 없다.
      await apply(data.session ?? null);
      return { needsConfirmation: data.session === null };
    },

    async signIn({ email, password }) {
      const { data, error } = await db.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      // 돌려받은 세션을 바로 반영한다. onAuthStateChange 를 기다리면 내 탭에는
      // 영영 오지 않아, 화면이 로그인 폼으로 되돌아간다.
      await apply(data.session ?? null);
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

    async listBoxes() {
      const me = requireSession();
      const rows = check(await db
        .from('box_members')
        .select('type_color, boxes!inner(id, name, invite_code, current_vol, sealed)')
        .eq('user_id', me.userId)
        .order('joined_at', { ascending: true }));

      const boxes = (rows ?? []) as unknown as {
        type_color: string;
        boxes: { id: string; name: string; invite_code: string; current_vol: number; sealed: boolean };
      }[];
      if (boxes.length === 0) return [];

      const counts = check(await db
        .from('box_members')
        .select('box_id')
        .in('box_id', boxes.map((b) => b.boxes.id))) as { box_id: string }[] | null;

      const tally = new Map<string, number>();
      for (const c of counts ?? []) tally.set(c.box_id, (tally.get(c.box_id) ?? 0) + 1);

      return boxes.map<BoxSummary>((r) => ({
        id: r.boxes.id,
        name: r.boxes.name,
        inviteCode: r.boxes.invite_code,
        currentVol: r.boxes.current_vol,
        memberCount: tally.get(r.boxes.id) ?? 1,
        myType: asType(r.type_color),
        sealed: r.boxes.sealed,
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
     * Neon 에는 Storage 가 없다 — Object Storage 는 베타이고, 브라우저에서 바로
     * 올리려면 presigned URL 을 발급할 서버가 필요한데 이 앱에는 서버 코드가 없다.
     * canUploadCover 가 false 라 화면이 애초에 사진 버튼을 내주지 않는다.
     */
    async uploadCover() {
      throw new Error('표지 사진은 아직 올릴 수 없습니다. 색 표지를 골라 주세요.');
    },

    coverUrl: (path) => path,
  };
}
