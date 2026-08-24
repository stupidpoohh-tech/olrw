import type { Session as AuthSession, SupabaseClient } from '@supabase/supabase-js';
import { isPaperId, type PaperId } from '../design/colors';
import { isTypeId, type TypeId } from '../design/typewriters';
import { supabase } from './supabase';
import type { BoxStore } from './store';
import type {
  BoxSummary, Envelope, LengthBucket, Member, Session, Volume, VolumePage,
} from './types';

const COVERS = 'covers';

const asPaper = (v: unknown): PaperId => (isPaperId(v) ? v : 'ivory');
const asType = (v: unknown): TypeId => (isTypeId(v) ? v : 'steel');
const asBucket = (v: unknown): LengthBucket =>
  v === 'medium' || v === 'long' ? v : 'short';

interface MemberRow {
  user_id: string;
  paper_color: string;
  type_color: string;
  joined_at: string;
  profiles: { display_name: string } | null;
}

export function createSupabaseStore(): BoxStore {
  const db: SupabaseClient = supabase();

  let session: Session | null = null;
  const listeners = new Set<(s: Session | null) => void>();

  /** auth.users 와 profiles 를 합쳐 세션을 만든다. 이름은 profiles 가 정본이다. */
  async function hydrate(auth: AuthSession | null): Promise<void> {
    if (!auth) { session = null; return; }
    // 익명 사용자는 profiles 가 아직 없을 수 있다. 이메일도 없다.
    const isAnon = auth.user.is_anonymous ?? auth.user.app_metadata?.provider === 'anonymous';
    const { data } = await db.from('profiles').select('display_name').eq('id', auth.user.id).maybeSingle();
    const base = {
      userId: auth.user.id,
      email: auth.user.email ?? '',
      displayName: data?.display_name ?? (isAnon ? '체험 사용자' : '이름 없음'),
    };
    session = isAnon ? { ...base, isGuest: true } : base;
  }
  const emit = () => listeners.forEach((cb) => cb(session));

  const booted = (async () => {
    const { data } = await db.auth.getSession();
    await hydrate(data.session);
    emit();
  })();

  db.auth.onAuthStateChange((_event, auth) => {
    void (async () => { await hydrate(auth); emit(); })();
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

    async signUp({ email, password, displayName }) {
      const name = displayName.trim().slice(0, 12);
      if (!name) throw new Error('표시 이름을 입력해 주세요.');
      // display_name 은 metadata 로 넘긴다 — handle_new_user 트리거가 프로필을 만든다.
      const { data, error } = await db.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { display_name: name } },
      });
      if (error) throw error;
      // 이메일 확인이 켜져 있으면 사용자만 생기고 세션은 없다.
      return { needsConfirmation: data.session === null };
    },

    async signIn({ email, password }) {
      const { error } = await db.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
    },

    async enterAsGuest() {
      // Supabase 대시보드의 Authentication → Settings 에서 익명 로그인을 켜야 된다.
      // 켜지 않은 프로젝트에서는 사용자에게 이유를 보여준다.
      const { error } = await db.auth.signInAnonymously();
      if (error) {
        throw new Error(
          '체험 모드가 켜져 있지 않습니다. Supabase 프로젝트 설정에서 익명 로그인을 켜 주세요.'
        );
      }
    },

    async signOut() {
      const { error } = await db.auth.signOut();
      if (error) throw error;
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
        .single());

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
      const box = check(await db.from('boxes').select('current_vol').eq('id', boxId).single());
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

    async uploadCover(boxId, file) {
      const name = globalThis.crypto?.randomUUID?.() ?? `c${Date.now()}`;
      const path = `${boxId}/${name}.jpg`;
      const { error } = await db.storage.from(COVERS)
        .upload(path, file, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      return path;
    },

    coverUrl(path) {
      return db.storage.from(COVERS).getPublicUrl(path).data.publicUrl;
    },
  };
}
