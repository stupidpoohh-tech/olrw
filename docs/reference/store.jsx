// ──────────────────────────────────────────────────────────────────
// Data layer — auth + multi-box (shared telegram archives) + colors
//
// A "box" (전보함) is a shared room joined by code. It holds many members
// (up to MAX_MEMBERS), a name, a shared VOL counter, telegrams and volumes.
// Each member has, PER BOX: a paper color (shared — colors their telegrams
// for everyone) and a typewriter color (personal — tints their own home
// screen so they can tell boxes apart).
//
// Public state (getState):
//   {
//     user:  null | { uid, email, displayName },
//     boxes: [ { roomId, name, code, currentVol, memberCount, myType } ],
//     room:  null | { roomId, name, code, ownerUid, isOwner,
//                     members: {uid:{name,paper,type}}, memberList:[...] },
//     me:      uid,                 // sender id
//     names:   { [uid]: name },     // uid → display name (this box)
//     papers:  { [uid]: paperId },  // uid → paper color (this box)
//     myPaper, myType,
//     currentVol, telegrams:[{id,from,text,time,vol}], volumes:[...],
//   }
// ──────────────────────────────────────────────────────────────────

const MAX_MEMBERS = 4;

const KEY = {
  users:     'olrw.users.v1',
  session:   'olrw.session.v1',
  rooms:     'olrw.rooms.v2',
  userRooms: 'olrw.userRooms.v2',
  active:    'olrw.active.v2',
  legacy1:   'olrw.rooms.v1',
  legacy2:   'olrw.userRoom.v1',
  legacy0:   'tajeon.local.v1',
};

const DEFAULT_PAPER = () => (window.PAPER_COLORS ? window.PAPER_COLORS[0].id : 'ivory');
const DEFAULT_TYPE  = () => (window.TYPE_COLORS  ? window.TYPE_COLORS[0].id  : 'green');

// ── helpers
const nowISO = () => new Date().toISOString();
const rand = (n = 4) => Math.random().toString(36).slice(2, 2 + n);
const newUid    = () => 'u_' + Date.now() + '_' + rand(4);
const newRoomId = () => 'r_' + Date.now() + '_' + rand(4);
const newTgId   = () => 't_' + Date.now() + '_' + rand(4);

const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genCode = () => {
  const grp = () =>
    Array.from({ length: 4 }, () => CODE_ALPHA[Math.floor(Math.random() * CODE_ALPHA.length)]).join('');
  return `${grp()}-${grp()}`;
};
const normalizeCode = (s) => {
  const x = (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (x.length !== 8) return null;
  return x.slice(0, 4) + '-' + x.slice(4);
};

const hashPw = (pw, salt = 'olrw_salt_v1') => {
  const s = salt + '|' + (pw || '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return 'h_' + (h >>> 0).toString(36);
};

const lsGet = (k, fb) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; }
};
const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

const fmtTime = (iso) => {
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtPeriod = (a, b) => {
  const f = (iso) => { const d = new Date(iso); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())}`; };
  return `${f(a)} — ${f(b)}`;
};

// build ordered member list: owner first, then join order
function memberList(room) {
  const m = room.members || {};
  return Object.keys(m)
    .map((uid) => ({ uid, ...m[uid] }))
    .sort((a, b) => {
      if (a.uid === room.ownerUid) return -1;
      if (b.uid === room.ownerUid) return 1;
      return (a.joinedAt || '').localeCompare(b.joinedAt || '');
    });
}

// ── seed a demo group box on FIRST EVER load
function seedIfEmpty() {
  if (lsGet(KEY.users, null) && lsGet(KEY.rooms, null)) return;
  [KEY.legacy0, KEY.legacy1, KEY.legacy2].forEach((k) => { try { localStorage.removeItem(k); } catch {} });

  const uidA = newUid(), uidB = newUid(), uidC = newUid();
  const users = {
    'demo@olrw':    { uid: uidA, email: 'demo@olrw',    passwordHash: hashPw('demo'), displayName: '나',   createdAt: nowISO() },
    'partner@olrw': { uid: uidB, email: 'partner@olrw', passwordHash: hashPw('demo'), displayName: '민서', createdAt: nowISO() },
    'friend@olrw':  { uid: uidC, email: 'friend@olrw',  passwordHash: hashPw('demo'), displayName: '재이', createdAt: nowISO() },
  };

  const roomId = newRoomId();
  const room = {
    roomId, name: '퇴근길 전보함', coupleCode: genCode(), ownerUid: uidA,
    memberUids: [uidA, uidB, uidC],
    members: {
      [uidA]: { name: '나',   paper: 'ivory',  type: 'green',    joinedAt: '2026-05-01T09:00:00' },
      [uidB]: { name: '민서', paper: 'blush',  type: 'green',    joinedAt: '2026-05-01T09:10:00' },
      [uidC]: { name: '재이', paper: 'powder', type: 'green',    joinedAt: '2026-05-02T20:00:00' },
    },
    currentVol: 4,
    telegrams: [
      { id: 't1', from: uidB, text: '오늘 퇴근길에 분식집 지나감 STOP 떡볶이 냄새에 발이 멈춤 STOP', time: '2026-05-19T18:42:00', vol: 4 },
      { id: 't2', from: uidC, text: '넷플릭스 다큐 하나 봤는데 꼭 말해줘야함 STOP 만나서 STOP',       time: '2026-05-18T23:11:00', vol: 4 },
      { id: 't3', from: uidA, text: '아까 길에서 고양이가 나를 따라옴 STOP 증거는 내 기억뿐 STOP',    time: '2026-05-19T20:15:00', vol: 4 },
      { id: 't4', from: uidB, text: '새로 산 향수가 실패 STOP 수박껍질 냄새남 STOP',                  time: '2026-05-18T09:30:00', vol: 4 },
      { id: 't5', from: uidC, text: '회사 화장실에서 울뻔함 STOP 별일아님 STOP 만나면 말할거임 STOP', time: '2026-05-17T14:03:00', vol: 4 },
    ],
    volumes: [
      { id: 'vol-3', vol: 3, label: 'VOL.3', title: '봄날의 출퇴근', period: '2026.05.05 — 05.11', count: 6, cover: 'sage', closedAt: '2026-05-12',
        telegrams: [
          { from: uidA, name: '나',   paper: 'ivory',  text: '어제 꿈에 중학교 나옴 STOP 체육복 입고있었음 STOP', time: '05.05 08:20' },
          { from: uidB, name: '민서', paper: 'blush',  text: '나도 요즘 맨날 학교꿈 STOP 시험못본 꿈 STOP',       time: '05.05 19:44' },
          { from: uidC, name: '재이', paper: 'powder', text: '점심에 혼밥했는데 행복했음 STOP',                    time: '05.06 12:33' },
          { from: uidB, name: '민서', paper: 'blush',  text: '카페 옆사람이 너랑 똑같은 말투 씀 STOP 놀람 STOP',   time: '05.07 16:02' },
          { from: uidA, name: '나',   paper: 'ivory',  text: '저녁에 비가 와서 그냥 걸음 STOP 우산 안가져옴 STOP', time: '05.08 19:50' },
          { from: uidC, name: '재이', paper: 'powder', text: '이번주 보고할거 많음 STOP 각오해 STOP',              time: '05.10 22:15' },
        ],
      },
    ],
    createdAt: nowISO(),
  };

  lsSet(KEY.users, users);
  lsSet(KEY.rooms, { [roomId]: room });
  lsSet(KEY.userRooms, { [uidA]: [roomId], [uidB]: [roomId], [uidC]: [roomId] });
  lsSet(KEY.active, {});
  lsSet(KEY.session, null);
}

// ── LOCAL STORE ────────────────────────────────────────────────────
function makeLocalStore() {
  seedIfEmpty();

  const readUsers     = () => lsGet(KEY.users, {});
  const readRooms     = () => lsGet(KEY.rooms, {});
  const readUserRooms = () => lsGet(KEY.userRooms, {});
  const readActive    = () => lsGet(KEY.active, {});
  const readSession   = () => lsGet(KEY.session, null);
  const findUserByUid = (users, uid) => Object.values(users).find((u) => u.uid === uid) || null;
  const pubUser = (u) => u && { uid: u.uid, email: u.email, displayName: u.displayName };

  const myRoomIds = (uid) => readUserRooms()[uid] || [];

  function getActiveRoomId(uid, rooms) {
    const ids = myRoomIds(uid).filter((id) => rooms[id]);
    if (ids.length === 0) return null;
    const saved = readActive()[uid];
    return ids.includes(saved) ? saved : ids[0];
  }

  function compute() {
    const session = readSession();
    if (!session?.uid) return { user: null, room: null };
    const users = readUsers();
    const user = findUserByUid(users, session.uid);
    if (!user) return { user: null, room: null };

    const rooms = readRooms();
    const ids = myRoomIds(user.uid).filter((id) => rooms[id]);
    const boxes = ids.map((id) => {
      const r = rooms[id];
      return {
        roomId: id, name: r.name, code: r.coupleCode,
        currentVol: r.currentVol, memberCount: (r.memberUids || []).length,
        myType: r.members?.[user.uid]?.type || DEFAULT_TYPE(),
      };
    });

    const activeId = getActiveRoomId(user.uid, rooms);
    if (!activeId) return { user: pubUser(user), boxes, room: null };

    const r = rooms[activeId];
    const names = {}, papers = {};
    Object.keys(r.members || {}).forEach((uid) => {
      names[uid] = r.members[uid].name;
      papers[uid] = r.members[uid].paper;
    });
    const mine = r.members?.[user.uid] || {};

    return {
      user: pubUser(user),
      boxes,
      room: {
        roomId: r.roomId, name: r.name, code: r.coupleCode,
        ownerUid: r.ownerUid, isOwner: r.ownerUid === user.uid,
        members: r.members || {}, memberList: memberList(r),
      },
      me: user.uid,
      names, papers,
      myPaper: mine.paper || DEFAULT_PAPER(),
      myType: mine.type || DEFAULT_TYPE(),
      currentVol: r.currentVol,
      telegrams: r.telegrams || [],
      volumes: r.volumes || [],
    };
  }

  let cache = compute();
  const subs = new Set();
  const refresh = () => { cache = compute(); subs.forEach((cb) => cb(cache)); };

  window.addEventListener('storage', (e) => {
    if (e.key && Object.values(KEY).includes(e.key)) refresh();
  });

  function setActive(uid, roomId) {
    const a = readActive(); a[uid] = roomId; lsSet(KEY.active, a);
  }
  function updateActiveRoom(updater) {
    const session = readSession(); if (!session) return;
    const rooms = readRooms();
    const roomId = getActiveRoomId(session.uid, rooms);
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId] = updater(rooms[roomId]);
    lsSet(KEY.rooms, rooms);
    refresh();
  }

  return {
    mode: 'local',
    getState: () => cache,
    subscribe: (cb) => { subs.add(cb); cb(cache); return () => subs.delete(cb); },

    // ── AUTH
    signUp: ({ email, password, displayName }) => {
      email = (email || '').trim().toLowerCase();
      password = password || '';
      displayName = (displayName || '').trim().slice(0, 12);
      if (!email || !email.includes('@')) throw new Error('이메일 형식이 올바르지 않아요.');
      if (password.length < 6) throw new Error('비밀번호는 6자 이상이어야 해요.');
      if (!displayName) throw new Error('표시이름을 입력해 주세요.');
      const users = readUsers();
      if (users[email]) throw new Error('이미 가입된 이메일이에요.');
      const u = { uid: newUid(), email, passwordHash: hashPw(password), displayName, createdAt: nowISO() };
      users[email] = u;
      lsSet(KEY.users, users);
      lsSet(KEY.session, { uid: u.uid });
      refresh();
      return pubUser(u);
    },

    signIn: ({ email, password }) => {
      email = (email || '').trim().toLowerCase();
      const users = readUsers();
      const u = users[email];
      if (!u) throw new Error('가입되지 않은 이메일이에요.');
      if (u.passwordHash !== hashPw(password || '')) throw new Error('비밀번호가 일치하지 않아요.');
      lsSet(KEY.session, { uid: u.uid });
      refresh();
      return pubUser(u);
    },

    signOut: () => { lsSet(KEY.session, null); refresh(); },

    updateDisplayName: (name) => {
      const session = readSession(); if (!session) return;
      const users = readUsers();
      const u = findUserByUid(users, session.uid); if (!u) return;
      const safe = (name || '').trim().slice(0, 12); if (!safe) return;
      u.displayName = safe;
      users[u.email] = u;
      lsSet(KEY.users, users);
      // reflect new name in every box the user belongs to
      const rooms = readRooms();
      myRoomIds(u.uid).forEach((rid) => {
        if (rooms[rid]?.members?.[u.uid]) rooms[rid].members[u.uid].name = safe;
      });
      lsSet(KEY.rooms, rooms);
      refresh();
    },

    // ── BOXES
    createBox: ({ name, paper, type } = {}) => {
      const session = readSession(); if (!session) throw new Error('로그인이 필요해요.');
      const users = readUsers();
      const u = findUserByUid(users, session.uid); if (!u) throw new Error('로그인이 필요해요.');
      const rooms = readRooms();
      let code, tries = 0;
      do { code = genCode(); tries++; } while (Object.values(rooms).some((r) => r.coupleCode === code) && tries < 8);
      const roomId = newRoomId();
      rooms[roomId] = {
        roomId, name: (name || '새 전보함').trim().slice(0, 20), coupleCode: code, ownerUid: u.uid,
        memberUids: [u.uid],
        members: { [u.uid]: { name: u.displayName, paper: paper || DEFAULT_PAPER(), type: type || DEFAULT_TYPE(), joinedAt: nowISO() } },
        currentVol: 1, telegrams: [], volumes: [], createdAt: nowISO(),
      };
      lsSet(KEY.rooms, rooms);
      const um = readUserRooms(); um[u.uid] = [...(um[u.uid] || []), roomId]; lsSet(KEY.userRooms, um);
      setActive(u.uid, roomId);
      refresh();
      return code;
    },

    joinBox: ({ code, paper, type } = {}) => {
      const session = readSession(); if (!session) throw new Error('로그인이 필요해요.');
      const users = readUsers();
      const u = findUserByUid(users, session.uid); if (!u) throw new Error('로그인이 필요해요.');
      const norm = normalizeCode(code);
      if (!norm) throw new Error('코드 형식이 올바르지 않아요. (예: ABCD-2345)');
      const rooms = readRooms();
      const room = Object.values(rooms).find((r) => r.coupleCode === norm);
      if (!room) throw new Error('해당 코드의 전보함을 찾을 수 없어요.');
      if (room.memberUids?.includes(u.uid)) { setActive(u.uid, room.roomId); refresh(); return room.roomId; }
      if ((room.memberUids || []).length >= MAX_MEMBERS) throw new Error(`정원이 가득 찼어요. (최대 ${MAX_MEMBERS}명)`);
      const usedPapers = Object.values(room.members || {}).map((m) => m.paper);
      room.memberUids = [...(room.memberUids || []), u.uid];
      room.members = { ...(room.members || {}), [u.uid]: {
        name: u.displayName,
        paper: paper || (window.pickPaper ? window.pickPaper(usedPapers) : DEFAULT_PAPER()),
        type: type || DEFAULT_TYPE(), joinedAt: nowISO(),
      } };
      rooms[room.roomId] = room;
      lsSet(KEY.rooms, rooms);
      const um = readUserRooms(); um[u.uid] = [...(um[u.uid] || []), room.roomId]; lsSet(KEY.userRooms, um);
      setActive(u.uid, room.roomId);
      refresh();
      return room.roomId;
    },

    leaveBox: (roomId) => {
      const session = readSession(); if (!session) return;
      const rooms = readRooms();
      const room = rooms[roomId]; if (!room) return;
      room.memberUids = (room.memberUids || []).filter((x) => x !== session.uid);
      if (room.members) delete room.members[session.uid];
      if (room.memberUids.length === 0) {
        delete rooms[roomId]; // empty box disappears
      } else {
        if (room.ownerUid === session.uid) room.ownerUid = room.memberUids[0];
        rooms[roomId] = room;
      }
      lsSet(KEY.rooms, rooms);
      const um = readUserRooms(); um[session.uid] = (um[session.uid] || []).filter((x) => x !== roomId); lsSet(KEY.userRooms, um);
      const a = readActive(); if (a[session.uid] === roomId) { delete a[session.uid]; lsSet(KEY.active, a); }
      refresh();
    },

    setActiveBox: (roomId) => {
      const session = readSession(); if (!session) return;
      setActive(session.uid, roomId);
      refresh();
    },

    renameBox: (name) => {
      const session = readSession(); if (!session) return;
      updateActiveRoom((r) => {
        if (!(r.memberUids || []).includes(session.uid)) return r;
        return { ...r, name: (name || '').trim().slice(0, 20) || r.name };
      });
    },

    setMyColors: ({ paper, type } = {}) => {
      const session = readSession(); if (!session) return;
      updateActiveRoom((r) => {
        const m = { ...(r.members || {}) };
        if (!m[session.uid]) return r;
        m[session.uid] = { ...m[session.uid],
          ...(paper ? { paper } : {}), ...(type ? { type } : {}) };
        return { ...r, members: m };
      });
    },

    // ── LEGACY name-editing shim
    setName: (uid, name) => {
      const session = readSession(); if (!session || uid !== session.uid) return;
      window.tajeonStore.updateDisplayName(name);
    },
    setMe: () => {},

    // ── TELEGRAMS / VOLUMES
    deleteTelegram: (id) => updateActiveRoom((r) => ({ ...r, telegrams: (r.telegrams || []).filter((t) => t.id !== id) })),
    deleteVolume:   (id) => updateActiveRoom((r) => ({ ...r, volumes: (r.volumes || []).filter((v) => v.id !== id) })),

    sendTelegram: (text) => {
      const session = readSession(); if (!session) return null;
      const rooms = readRooms();
      const roomId = getActiveRoomId(session.uid, rooms);
      const room = rooms[roomId]; if (!room) return null;
      const t = { id: newTgId(), from: session.uid, text, time: nowISO(), vol: room.currentVol };
      updateActiveRoom((r) => ({ ...r, telegrams: [t, ...(r.telegrams || [])] }));
      return t;
    },

    closeVol: ({ title, cover }) => {
      const session = readSession(); if (!session) return null;
      const rooms = readRooms();
      const roomId = getActiveRoomId(session.uid, rooms);
      const room = rooms[roomId]; if (!room) return null;
      const tg = (room.telegrams || []).filter((t) => t.vol === room.currentVol);
      if (tg.length === 0) return null;
      const times = tg.map((t) => new Date(t.time).getTime());
      const period = fmtPeriod(new Date(Math.min(...times)).toISOString(), new Date(Math.max(...times)).toISOString());
      const newVol = {
        id: 'vol-' + room.currentVol, vol: room.currentVol, label: 'VOL.' + room.currentVol,
        title: title || `VOL.${room.currentVol}`, period, count: tg.length, cover: cover || 'sage', closedAt: nowISO(),
        telegrams: tg.slice().reverse().map((t) => ({
          from: t.from,
          name: room.members?.[t.from]?.name || '?',
          paper: room.members?.[t.from]?.paper || DEFAULT_PAPER(),
          text: t.text, time: fmtTime(t.time).slice(5, 16).replace('-', '.'),
        })),
      };
      updateActiveRoom((r) => ({
        ...r, currentVol: r.currentVol + 1,
        telegrams: (r.telegrams || []).filter((t) => t.vol !== newVol.vol),
        volumes: [newVol, ...(r.volumes || [])],
      }));
      return newVol;
    },

    resetAll: () => {
      Object.values(KEY).forEach((k) => { try { localStorage.removeItem(k); } catch {} });
      seedIfEmpty();
      refresh();
    },
  };
}

// ── FIREBASE STORE ────────────────────────────────────────────────
// Firestore model:
//   users/{uid}                     { email, displayName, roomIds:[], createdAt }
//   codes/{CODE}                    { roomId, createdBy }
//   rooms/{roomId}                  { name, coupleCode, ownerUid, memberUids:[],
//                                     members:{uid:{name,paper,type,joinedAt}}, currentVol, createdAt }
//   rooms/{roomId}/telegrams/{id}   { from, text, time, vol }
//   rooms/{roomId}/volumes/{volId}  { vol,label,title,period,count,cover,closedAt, telegrams:[{from,name,paper,text,time}] }
// See DEPLOY.md for security rules.

function translateAuthError(e) {
  const code = e?.code || '';
  if (code === 'auth/email-already-in-use')      return '이미 가입된 이메일이에요.';
  if (code === 'auth/invalid-email')             return '이메일 형식이 올바르지 않아요.';
  if (code === 'auth/weak-password')             return '비밀번호는 6자 이상이어야 해요.';
  if (code === 'auth/user-not-found')            return '가입되지 않은 이메일이에요.';
  if (code === 'auth/wrong-password')            return '비밀번호가 일치하지 않아요.';
  if (code === 'auth/invalid-credential')        return '이메일 또는 비밀번호가 일치하지 않아요.';
  if (code === 'auth/invalid-login-credentials') return '이메일 또는 비밀번호가 일치하지 않아요.';
  if (code === 'auth/too-many-requests')         return '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.';
  if (code === 'auth/network-request-failed')    return '네트워크 연결을 확인해 주세요.';
  if (code === 'auth/operation-not-allowed')     return 'Firebase 콘솔에서 이메일/비밀번호 로그인을 활성화해 주세요.';
  return e?.message || '인증에 실패했어요.';
}

function makeFirebaseStore(cfg) {
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  const auth = firebase.auth();
  const db = firebase.firestore();

  let raw = {
    user: null,               // { uid, email, displayName, roomIds:[] }
    boxes: {},                // roomId → room doc data
    activeId: null,
    telegrams: [],
    volumes: [],
    booting: true,
  };

  let userUnsub = null;
  const boxUnsubs = {};        // roomId → unsub (room doc)
  let tgUnsub = null, volUnsub = null;

  function computePub() {
    if (raw.booting) return { user: null, room: null, _loading: true };
    if (!auth.currentUser) return { user: null, room: null };
    if (!raw.user) return { user: null, room: null, _loading: true };
    const userPub = { uid: raw.user.uid, email: raw.user.email, displayName: raw.user.displayName };

    const ids = (raw.user.roomIds || []).filter((id) => raw.boxes[id]);
    const boxes = ids.map((id) => {
      const r = raw.boxes[id];
      return {
        roomId: id, name: r.name, code: r.coupleCode,
        currentVol: r.currentVol || 1, memberCount: (r.memberUids || []).length,
        myType: r.members?.[raw.user.uid]?.type || DEFAULT_TYPE(),
      };
    });

    const activeId = ids.includes(raw.activeId) ? raw.activeId : ids[0] || null;
    if (!activeId) return { user: userPub, boxes, room: null };

    const r = raw.boxes[activeId];
    const names = {}, papers = {};
    Object.keys(r.members || {}).forEach((uid) => {
      names[uid] = r.members[uid].name;
      papers[uid] = r.members[uid].paper;
    });
    const mine = r.members?.[raw.user.uid] || {};

    return {
      user: userPub, boxes,
      room: {
        roomId: activeId, name: r.name, code: r.coupleCode,
        ownerUid: r.ownerUid, isOwner: r.ownerUid === raw.user.uid,
        members: r.members || {}, memberList: memberList({ ...r, roomId: activeId }),
      },
      me: raw.user.uid,
      names, papers,
      myPaper: mine.paper || DEFAULT_PAPER(),
      myType: mine.type || DEFAULT_TYPE(),
      currentVol: r.currentVol || 1,
      telegrams: raw.telegrams,
      volumes: raw.volumes,
    };
  }

  let pub = computePub();
  const subs = new Set();
  const notify = () => { pub = computePub(); subs.forEach((cb) => cb(pub)); };

  const activeKey = () => raw.user ? 'olrw.fb.active.' + raw.user.uid : 'olrw.fb.active';
  const loadActive = () => { try { return localStorage.getItem(activeKey()); } catch { return null; } };
  const saveActive = (id) => { try { localStorage.setItem(activeKey(), id); } catch {} };

  function detachActiveListeners() {
    if (tgUnsub) tgUnsub(); if (volUnsub) volUnsub();
    tgUnsub = volUnsub = null;
    raw.telegrams = []; raw.volumes = [];
  }

  function attachActiveListeners(roomId) {
    detachActiveListeners();
    if (!roomId) { notify(); return; }
    tgUnsub = db.collection('rooms').doc(roomId).collection('telegrams')
      .orderBy('time', 'desc').onSnapshot((snap) => {
        raw.telegrams = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        notify();
      }, (err) => console.warn('[OLRW] telegrams', err));
    volUnsub = db.collection('rooms').doc(roomId).collection('volumes')
      .orderBy('vol', 'desc').onSnapshot((snap) => {
        raw.volumes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        notify();
      }, (err) => console.warn('[OLRW] volumes', err));
  }

  function ensureActive() {
    const ids = (raw.user?.roomIds || []).filter((id) => raw.boxes[id]);
    let want = loadActive();
    if (!ids.includes(want)) want = ids[0] || null;
    if (want !== raw.activeId) {
      raw.activeId = want;
      attachActiveListeners(want);
    }
  }

  function syncBoxListeners() {
    const ids = raw.user?.roomIds || [];
    // attach new
    ids.forEach((id) => {
      if (!boxUnsubs[id]) {
        boxUnsubs[id] = db.collection('rooms').doc(id).onSnapshot((snap) => {
          if (snap.exists) raw.boxes[id] = { id, ...snap.data() };
          else delete raw.boxes[id];
          ensureActive();
          notify();
        }, (err) => console.warn('[OLRW] room', id, err));
      }
    });
    // detach removed
    Object.keys(boxUnsubs).forEach((id) => {
      if (!ids.includes(id)) { boxUnsubs[id](); delete boxUnsubs[id]; delete raw.boxes[id]; }
    });
    ensureActive();
  }

  function attachUserListener(uid) {
    userUnsub = db.collection('users').doc(uid).onSnapshot((snap) => {
      const data = snap.data();
      if (!data) return;
      raw.user = { uid, email: data.email, displayName: data.displayName, roomIds: data.roomIds || [] };
      syncBoxListeners();
      notify();
    }, (err) => console.warn('[OLRW] user', err));
  }

  function detachAll() {
    if (userUnsub) { userUnsub(); userUnsub = null; }
    Object.keys(boxUnsubs).forEach((id) => { boxUnsubs[id](); delete boxUnsubs[id]; });
    detachActiveListeners();
    raw.user = null; raw.boxes = {}; raw.activeId = null;
  }

  auth.onAuthStateChanged((u) => {
    raw.booting = false;
    detachAll();
    if (u) attachUserListener(u.uid);
    notify();
  });

  async function reserveCode(roomId, uid) {
    for (let i = 0; i < 8; i++) {
      const candidate = genCode();
      try {
        await db.runTransaction(async (t) => {
          const cref = db.collection('codes').doc(candidate);
          const cs = await t.get(cref);
          if (cs.exists) throw new Error('collision');
          t.set(cref, { roomId, createdBy: uid });
        });
        return candidate;
      } catch { /* retry */ }
    }
    throw new Error('코드 생성에 실패했어요. 다시 시도해 주세요.');
  }

  return {
    mode: 'firebase',
    getState: () => pub,
    subscribe: (cb) => { subs.add(cb); cb(pub); return () => subs.delete(cb); },

    // ── AUTH
    signUp: async ({ email, password, displayName }) => {
      email = (email || '').trim().toLowerCase();
      password = password || '';
      displayName = (displayName || '').trim().slice(0, 12);
      if (!email || !email.includes('@')) throw new Error('이메일 형식이 올바르지 않아요.');
      if (password.length < 6) throw new Error('비밀번호는 6자 이상이어야 해요.');
      if (!displayName) throw new Error('표시이름을 입력해 주세요.');
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await db.collection('users').doc(cred.user.uid).set({
          email, displayName, roomIds: [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return { uid: cred.user.uid, email, displayName };
      } catch (e) { throw new Error(translateAuthError(e)); }
    },

    signIn: async ({ email, password }) => {
      try {
        const cred = await auth.signInWithEmailAndPassword((email || '').trim().toLowerCase(), password || '');
        return { uid: cred.user.uid, email: cred.user.email };
      } catch (e) { throw new Error(translateAuthError(e)); }
    },

    signOut: () => auth.signOut(),

    updateDisplayName: async (name) => {
      const u = auth.currentUser; if (!u) return;
      const safe = (name || '').trim().slice(0, 12); if (!safe) return;
      await db.collection('users').doc(u.uid).update({ displayName: safe });
      // update my name in every box I'm in
      const ids = raw.user?.roomIds || [];
      await Promise.all(ids.map((id) =>
        db.collection('rooms').doc(id).update({ [`members.${u.uid}.name`]: safe }).catch(() => {})
      ));
    },

    // ── BOXES
    createBox: async ({ name, paper, type } = {}) => {
      const u = auth.currentUser; if (!u) throw new Error('로그인이 필요해요.');
      const roomRef = db.collection('rooms').doc();
      const code = await reserveCode(roomRef.id, u.uid);
      await roomRef.set({
        name: (name || '새 전보함').trim().slice(0, 20),
        coupleCode: code, ownerUid: u.uid,
        memberUids: [u.uid],
        members: { [u.uid]: { name: raw.user?.displayName || '나', paper: paper || DEFAULT_PAPER(), type: type || DEFAULT_TYPE(), joinedAt: nowISO() } },
        currentVol: 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection('users').doc(u.uid).update({
        roomIds: firebase.firestore.FieldValue.arrayUnion(roomRef.id),
      });
      saveActive(roomRef.id); raw.activeId = roomRef.id;
      return code;
    },

    joinBox: async ({ code, paper, type } = {}) => {
      const u = auth.currentUser; if (!u) throw new Error('로그인이 필요해요.');
      const norm = normalizeCode(code);
      if (!norm) throw new Error('코드 형식이 올바르지 않아요. (예: ABCD-2345)');
      const codeSnap = await db.collection('codes').doc(norm).get();
      if (!codeSnap.exists) throw new Error('해당 코드의 전보함을 찾을 수 없어요.');
      const roomId = codeSnap.data().roomId;
      const roomRef = db.collection('rooms').doc(roomId);
      await db.runTransaction(async (t) => {
        const rs = await t.get(roomRef);
        if (!rs.exists) throw new Error('해당 코드의 전보함을 찾을 수 없어요.');
        const room = rs.data();
        if ((room.memberUids || []).includes(u.uid)) return; // already in
        if ((room.memberUids || []).length >= MAX_MEMBERS) throw new Error(`정원이 가득 찼어요. (최대 ${MAX_MEMBERS}명)`);
        const usedPapers = Object.values(room.members || {}).map((m) => m.paper);
        t.update(roomRef, {
          memberUids: firebase.firestore.FieldValue.arrayUnion(u.uid),
          [`members.${u.uid}`]: {
            name: raw.user?.displayName || '나',
            paper: paper || (window.pickPaper ? window.pickPaper(usedPapers) : DEFAULT_PAPER()),
            type: type || DEFAULT_TYPE(), joinedAt: nowISO(),
          },
        });
      });
      await db.collection('users').doc(u.uid).update({
        roomIds: firebase.firestore.FieldValue.arrayUnion(roomId),
      });
      saveActive(roomId); raw.activeId = roomId;
      return roomId;
    },

    leaveBox: async (roomId) => {
      const u = auth.currentUser; if (!u) return;
      const roomRef = db.collection('rooms').doc(roomId);
      try {
        await db.runTransaction(async (t) => {
          const rs = await t.get(roomRef);
          if (!rs.exists) return;
          const room = rs.data();
          const remaining = (room.memberUids || []).filter((x) => x !== u.uid);
          if (remaining.length === 0) {
            t.delete(roomRef);
            if (room.coupleCode) t.delete(db.collection('codes').doc(room.coupleCode));
          } else {
            const upd = {
              memberUids: firebase.firestore.FieldValue.arrayRemove(u.uid),
              [`members.${u.uid}`]: firebase.firestore.FieldValue.delete(),
            };
            if (room.ownerUid === u.uid) upd.ownerUid = remaining[0];
            t.update(roomRef, upd);
          }
        });
      } catch (e) { console.warn('[OLRW] leaveBox', e); }
      await db.collection('users').doc(u.uid).update({
        roomIds: firebase.firestore.FieldValue.arrayRemove(roomId),
      });
      if (raw.activeId === roomId) { raw.activeId = null; try { localStorage.removeItem(activeKey()); } catch {} }
    },

    setActiveBox: (roomId) => {
      saveActive(roomId); raw.activeId = roomId;
      attachActiveListeners(roomId);
      notify();
    },

    renameBox: async (name) => {
      const u = auth.currentUser; if (!u || !pub.room) return;
      const safe = (name || '').trim().slice(0, 20); if (!safe) return;
      await db.collection('rooms').doc(pub.room.roomId).update({ name: safe });
    },

    setMyColors: async ({ paper, type } = {}) => {
      const u = auth.currentUser; if (!u || !pub.room) return;
      const upd = {};
      if (paper) upd[`members.${u.uid}.paper`] = paper;
      if (type)  upd[`members.${u.uid}.type`]  = type;
      if (Object.keys(upd).length) await db.collection('rooms').doc(pub.room.roomId).update(upd);
    },

    setName: async (uid, name) => {
      const u = auth.currentUser; if (!u || uid !== u.uid) return;
      await window.tajeonStore.updateDisplayName(name);
    },
    setMe: () => {},

    sendTelegram: async (text) => {
      if (!pub.room) return null;
      const t = { from: auth.currentUser.uid, text, time: nowISO(), vol: pub.currentVol || 1 };
      await db.collection('rooms').doc(pub.room.roomId).collection('telegrams').add(t);
      return t;
    },

    deleteTelegram: async (id) => {
      if (!pub.room) return;
      await db.collection('rooms').doc(pub.room.roomId).collection('telegrams').doc(id).delete();
    },

    deleteVolume: async (id) => {
      if (!pub.room) return;
      await db.collection('rooms').doc(pub.room.roomId).collection('volumes').doc(id).delete();
    },

    closeVol: async ({ title, cover }) => {
      if (!pub.room) return null;
      const roomId = pub.room.roomId;
      const v = pub.currentVol || 1;
      const members = pub.room.members || {};
      const tg = raw.telegrams.filter((t) => t.vol === v);
      if (tg.length === 0) return null;
      const times = tg.map((t) => new Date(t.time).getTime());
      const period = fmtPeriod(new Date(Math.min(...times)).toISOString(), new Date(Math.max(...times)).toISOString());
      const newVol = {
        vol: v, label: 'VOL.' + v, title: title || `VOL.${v}`, period, count: tg.length,
        cover: cover || 'sage', closedAt: nowISO(),
        telegrams: tg.slice().reverse().map((t) => ({
          from: t.from,
          name: members[t.from]?.name || '?',
          paper: members[t.from]?.paper || DEFAULT_PAPER(),
          text: t.text, time: fmtTime(t.time).slice(5, 16).replace('-', '.'),
        })),
      };
      const batch = db.batch();
      batch.set(db.collection('rooms').doc(roomId).collection('volumes').doc('vol-' + v), newVol);
      tg.forEach((t) => batch.delete(db.collection('rooms').doc(roomId).collection('telegrams').doc(t.id)));
      batch.update(db.collection('rooms').doc(roomId), { currentVol: v + 1 });
      await batch.commit();
      return newVol;
    },

    resetAll: () => {},
  };
}

window.tajeonStore = (() => {
  const forceLocal = /[?&]local\b/.test(location.search);
  if (!forceLocal && window.FIREBASE_CONFIG && window.firebase) {
    try { return makeFirebaseStore(window.FIREBASE_CONFIG); }
    catch (e) { console.warn('[OLRW] Firebase init failed; using localStorage demo:', e); }
  }
  return makeLocalStore();
})();
