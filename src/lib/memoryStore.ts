import { pickPaper, type PaperId } from '../design/colors';
import type { TypeId } from '../design/typewriters';
import type { BoxStore } from './store';
import type {
  Box, BoxSummary, Envelope, LengthBucket, Member, Session, Uuid, Volume, VolumePage,
} from './types';

/**
 * 테스트 · 오프라인 개발용 구현.
 *
 * **서버 규칙을 그대로 흉내낸다.** 정원 4명, 봉인, 제본 스냅샷, 소프트 삭제까지.
 * 여기서만 되고 운영에서 안 되는 상황을 만들지 않기 위해서다 —
 * 규칙이 갈라지는 순간 이 구현은 거짓말을 하기 시작한다.
 *
 * 데이터는 localStorage 에 담는다. 새로고침해도 이어진다.
 */

const KEY = 'olrw.memory.v1';
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface User { id: Uuid; email: string; password: string; displayName: string }
interface MemberRow { userId: Uuid; paper: PaperId; type: TypeId; joinedAt: string }
interface BoxRow {
  id: Uuid; name: string; inviteCode: string; ownerId: Uuid;
  currentVol: number; sealed: boolean; readingStartedAt: string | null;
  createdAt: string; members: MemberRow[];
}
interface TelegramRow {
  id: Uuid; boxId: Uuid; authorId: Uuid; body: string; vol: number;
  createdAt: string; deletedAt: string | null;
}
interface VolumeRow {
  id: Uuid; boxId: Uuid; vol: number; title: string;
  coverKind: 'color' | 'photo'; coverValue: string;
  periodStart: string; periodEnd: string; pageCount: number;
  readTogether: boolean; closedAt: string; pages: VolumePage[];
}
interface Db {
  users: User[]; boxes: BoxRow[]; telegrams: TelegramRow[]; volumes: VolumeRow[];
  sessionUserId: Uuid | null;
}

const empty = (): Db => ({ users: [], boxes: [], telegrams: [], volumes: [], sessionUserId: null });

const uuid = (): Uuid =>
  (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now()}`);

const genCode = (): string => {
  const grp = () => Array.from({ length: 4 },
    () => CODE_ALPHA[Math.floor(Math.random() * CODE_ALPHA.length)]).join('');
  return `${grp()}-${grp()}`;
};

/** ABCD2345 로 붙여 넣어도, abcd-2345 로 넣어도 받는다. 서버 join_box 와 같은 규칙. */
const normalizeCode = (raw: string): string | null => {
  const x = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return x.length === 8 ? `${x.slice(0, 4)}-${x.slice(4)}` : null;
};

const bucket = (body: string): LengthBucket =>
  body.length <= 30 ? 'short' : body.length <= 70 ? 'medium' : 'long';

export function createMemoryStore(): BoxStore {
  let db: Db = load();

  function load(): Db {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...empty(), ...(JSON.parse(raw) as Db) } : empty();
    } catch { return empty(); }
  }
  function save(): void {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 사파리 프라이빗 모드 */ }
  }

  const listeners = new Set<(s: Session | null) => void>();
  const sessionOf = (): Session | null => {
    const u = db.users.find((x) => x.id === db.sessionUserId);
    return u ? { userId: u.id, email: u.email, displayName: u.displayName } : null;
  };

  /**
   * 세션 변화를 알린다. **세션이 실제로 바뀔 때만** 부른다.
   *
   * 전보함을 만들 때마다 여기까지 부르면, 구독하는 화면이 통째로 다시 그려지면서
   * 초대 코드 화면이 뜨자마자 사라진다. supabaseStore 는 쓰기 때 auth 를 건드리지
   * 않으므로, 여기서도 같아야 한다 — 안 그러면 이 구현만 다르게 동작한다.
   */
  const emitSession = () => { save(); listeners.forEach((cb) => cb(sessionOf())); };

  const me = (): User => {
    const u = db.users.find((x) => x.id === db.sessionUserId);
    if (!u) throw new Error('로그인이 필요합니다.');
    return u;
  };
  const boxOf = (id: Uuid): BoxRow => {
    const b = db.boxes.find((x) => x.id === id);
    if (!b) throw new Error('전보함을 찾을 수 없습니다.');
    return b;
  };
  const requireMember = (boxId: Uuid): BoxRow => {
    const b = boxOf(boxId);
    if (!b.members.some((m) => m.userId === db.sessionUserId)) {
      throw new Error('이 전보함의 참여자가 아닙니다.');
    }
    return b;
  };

  /** 서버의 can_read_body() 와 같은 판정. 한 곳에만 둔다. */
  const canReadBody = (b: BoxRow, t: TelegramRow): boolean =>
    t.authorId === db.sessionUserId
    || !b.sealed
    || t.vol < b.currentVol
    || b.readingStartedAt !== null;

  const toMembers = (b: BoxRow): Member[] =>
    b.members
      .map<Member>((m) => ({
        userId: m.userId,
        displayName: db.users.find((u) => u.id === m.userId)?.displayName ?? '이름 없음',
        paper: m.paper,
        joinedAt: m.joinedAt,
        isOwner: m.userId === b.ownerId,
        isMe: m.userId === db.sessionUserId,
      }))
      .sort((x, y) => (x.isOwner === y.isOwner ? x.joinedAt.localeCompare(y.joinedAt) : x.isOwner ? -1 : 1));

  return {
    getSession: sessionOf,
    onSessionChange(cb) { listeners.add(cb); cb(sessionOf()); return () => listeners.delete(cb); },
    ready: () => Promise.resolve(),

    async signUp({ email, password, displayName }) {
      const mail = email.trim().toLowerCase();
      const name = displayName.trim().slice(0, 12);
      if (!mail.includes('@')) throw new Error('이메일 형식이 올바르지 않습니다.');
      if (password.length < 6) throw new Error('비밀번호는 6자 이상이어야 합니다.');
      if (!name) throw new Error('표시 이름을 입력해 주세요.');
      if (db.users.some((u) => u.email === mail)) throw new Error('이미 가입된 이메일입니다.');
      const user: User = { id: uuid(), email: mail, password, displayName: name };
      db.users.push(user);
      db.sessionUserId = user.id;
      emitSession();
      return { needsConfirmation: false };   // 메모리 구현에는 확인 메일이 없다
    },

    async signIn({ email, password }) {
      const mail = email.trim().toLowerCase();
      const u = db.users.find((x) => x.email === mail);
      if (!u || u.password !== password) throw new Error('이메일 또는 비밀번호가 일치하지 않습니다.');
      db.sessionUserId = u.id;
      emitSession();
    },

    async signOut() { db.sessionUserId = null; emitSession(); },

    async updateDisplayName(name) {
      const safe = name.trim().slice(0, 12);
      if (!safe) throw new Error('표시 이름을 입력해 주세요.');
      me().displayName = safe;
      emitSession();
    },

    async listBoxes() {
      const uid = me().id;
      return db.boxes
        .filter((b) => b.members.some((m) => m.userId === uid))
        .map<BoxSummary>((b) => ({
          id: b.id, name: b.name, inviteCode: b.inviteCode,
          currentVol: b.currentVol, memberCount: b.members.length,
          myType: b.members.find((m) => m.userId === uid)?.type ?? 'steel',
          sealed: b.sealed,
        }));
    },

    async getBox(boxId) {
      const b = requireMember(boxId);
      const mine = b.members.find((m) => m.userId === db.sessionUserId);
      return {
        id: b.id, name: b.name, inviteCode: b.inviteCode, ownerId: b.ownerId,
        currentVol: b.currentVol, sealed: b.sealed, readingStartedAt: b.readingStartedAt,
        memberCount: b.members.length,
        myPaper: mine?.paper ?? 'ivory', myType: mine?.type ?? 'steel',
        members: toMembers(b),
      } satisfies Box;
    },

    async createBox({ name, paper, type, sealed }) {
      const u = me();
      let code = genCode();
      while (db.boxes.some((b) => b.inviteCode === code)) code = genCode();
      const box: BoxRow = {
        id: uuid(), name: name.trim().slice(0, 20) || '이름 없는 전보함',
        inviteCode: code, ownerId: u.id, currentVol: 1, sealed,
        readingStartedAt: null, createdAt: new Date().toISOString(),
        members: [{ userId: u.id, paper, type, joinedAt: new Date().toISOString() }],
      };
      db.boxes.push(box);
      save();
      return { boxId: box.id, inviteCode: code };
    },

    async joinBox({ code, paper, type }) {
      const u = me();
      const norm = normalizeCode(code);
      if (!norm) throw new Error('코드 형식이 올바르지 않습니다. (예: ABCD-2345)');
      const b = db.boxes.find((x) => x.inviteCode === norm);
      if (!b) throw new Error('해당 코드의 전보함을 찾을 수 없습니다.');
      if (b.members.some((m) => m.userId === u.id)) return { boxId: b.id, name: b.name };
      // 정원 4명. 의도적 상한 — 올리지 않는다.
      if (b.members.length >= 4) throw new Error('정원이 가득 찼습니다. (최대 4명)');
      // 서버 join_box 와 같다: 고른 용지색이 이미 쓰이고 있으면 남은 색으로 돌린다.
      // 같은 전보함에 같은 용지색이 둘이면 발신인을 색으로 못 읽는다.
      const used = b.members.map((m) => m.paper);
      b.members.push({
        userId: u.id,
        paper: used.includes(paper) ? pickPaper(used) : paper,
        type,
        joinedAt: new Date().toISOString(),
      });
      save();
      return { boxId: b.id, name: b.name };
    },

    async renameBox(boxId, name) {
      const safe = name.trim().slice(0, 20);
      if (!safe) throw new Error('전보함 이름을 입력해 주세요.');
      requireMember(boxId).name = safe;
      save();
    },

    async setMyColors(boxId, colors) {
      const b = requireMember(boxId);
      const m = b.members.find((x) => x.userId === db.sessionUserId);
      if (!m) return;
      if (colors.paper) m.paper = colors.paper;
      if (colors.type) m.type = colors.type;
      save();
    },

    async leaveBox(boxId) {
      const uid = me().id;
      const b = requireMember(boxId);
      b.members = b.members.filter((m) => m.userId !== uid);
      const next = [...b.members].sort((x, y) => x.joinedAt.localeCompare(y.joinedAt))[0];
      if (!next) {
        // 마지막 사람이 나갔다. 서버는 행을 남기고 서가만 내리는데, 멤버가 없으면
        // 어차피 누구에게도 보이지 않는다. 여기서는 목록에서 뺀다.
        db.boxes = db.boxes.filter((x) => x.id !== b.id);
      } else if (b.ownerId === uid) {
        b.ownerId = next.userId;   // 소유자 이양
      }
      save();
    },

    async listEnvelopes(boxId, vol) {
      const b = requireMember(boxId);
      const want = vol ?? b.currentVol;
      return db.telegrams
        .filter((t) => t.boxId === boxId && t.vol === want && t.deletedAt === null)
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
        .map<Envelope>((t) => {
          const open = canReadBody(b, t);
          return {
            id: t.id, boxId: t.boxId, authorId: t.authorId, vol: t.vol,
            createdAt: t.createdAt,
            unsealed: open,
            body: open ? t.body : null,
            lengthBucket: bucket(t.body),
          };
        });
    },

    async sendTelegram(boxId, body) {
      const u = me();
      const b = requireMember(boxId);
      const text = body.trim();
      if (!text) throw new Error('전할 말을 입력해 주세요.');
      if (text.length > 100) throw new Error('전보는 100자까지 보낼 수 있습니다.');
      db.telegrams.push({
        id: uuid(), boxId, authorId: u.id, body: text, vol: b.currentVol,
        createdAt: new Date().toISOString(), deletedAt: null,
      });
      save();
    },

    async deleteTelegram(id) {
      const t = db.telegrams.find((x) => x.id === id);
      if (!t || t.authorId !== db.sessionUserId) return;
      if (t.deletedAt) throw new Error('삭제한 전보는 되돌릴 수 없습니다.');
      t.deletedAt = new Date().toISOString();
      save();
    },

    async beginReading(boxId) {
      const b = requireMember(boxId);
      // 한 번 열린 권은 다시 봉인되지 않는다.
      b.readingStartedAt ??= new Date().toISOString();
      save();
    },

    async closeVolume(boxId, input) {
      const b = requireMember(boxId);
      const live = db.telegrams
        .filter((t) => t.boxId === boxId && t.vol === b.currentVol && t.deletedAt === null)
        .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
      if (live.length === 0) throw new Error('묶을 전보가 없습니다.');

      const now = new Date().toISOString();
      const volume: VolumeRow = {
        id: uuid(), boxId, vol: b.currentVol,
        title: input.title.trim().slice(0, 20),
        coverKind: input.coverKind, coverValue: input.coverValue,
        periodStart: live[0]!.createdAt,
        periodEnd: live[live.length - 1]!.createdAt,
        pageCount: live.length, readTogether: input.readTogether, closedAt: now,
        // 스냅샷. 이름과 용지색을 지금 값으로 복사한다.
        pages: live.map<VolumePage>((t, i) => ({
          ord: i + 1,
          authorId: t.authorId,
          authorName: db.users.find((u) => u.id === t.authorId)?.displayName ?? '?',
          paperColor: b.members.find((m) => m.userId === t.authorId)?.paper ?? 'ivory',
          body: t.body,
          sentAt: t.createdAt,
        })),
      };
      db.volumes.push(volume);
      for (const t of live) t.deletedAt = now;   // 파기하지 않는다
      b.currentVol += 1;
      b.readingStartedAt = null;                 // 다음 권은 다시 봉인
      save();
      return volume.id;
    },

    async listVolumes(boxId) {
      requireMember(boxId);
      return db.volumes
        .filter((v) => v.boxId === boxId)
        .sort((x, y) => y.vol - x.vol)
        .map<Volume>(({ pages: _pages, ...v }) => v);
    },

    async getVolumePages(volumeId) {
      return db.volumes.find((v) => v.id === volumeId)?.pages ?? [];
    },

    async uploadCover(_boxId, file) {
      // 실제 Storage 대신 objectURL. 새로고침하면 사라지지만 개발 중에는 충분하다.
      return URL.createObjectURL(file);
    },

    coverUrl: (path) => path,
  };
}

/** 개발 중 데이터를 비운다. */
export function resetMemoryStore(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
