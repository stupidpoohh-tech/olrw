import type { BoxStore } from './store';
import type { Session } from './types';

/**
 * 체험 모드를 브라우저 안에 가둔다.
 *
 * Supabase 에서는 익명 로그인이 진짜 사용자를 하나 만들어 줬다. Neon 에는 그런 것이
 * 없다 — `anonymous` 역할은 사용자 id 가 없어서 전보를 쓸 수도, 전보함을 만들 수도
 * 없다 (D14). 그래서 체험 모드는 서버에 닿지 않고 memoryStore 위에서만 돈다.
 *
 * 여기가 하는 일은 하나다. **지금 누구인가**를 보고 두 구현 중 하나로 넘긴다.
 *
 *   정식 세션이 있으면 → real
 *   아니고 체험 세션이 있으면 → guest
 *   둘 다 없으면 → real (가입·로그인이 그리로 가야 한다)
 *
 * 체험 데이터는 브라우저 저장소에만 남는다. 로그인하면 그 자리에서 지운다 —
 * 남기면 정식 계정 옆에 유령 전보함이 따라다닌다.
 */
export function withGuestMode(real: BoxStore, guest: BoxStore): BoxStore {
  const active = (): BoxStore =>
    real.getSession() ? real : guest.getSession() ? guest : real;

  const session = (): Session | null => real.getSession() ?? guest.getSession();

  /** 정식 세션이 생겼다. 체험 흔적을 지운다. 실패해도 로그인을 막지 않는다. */
  const dropGuest = async (): Promise<void> => {
    if (!guest.getSession()) return;
    try { await guest.signOut(); } catch { /* 지우지 못해도 로그인은 성립한다 */ }
  };

  return {
    getSession: session,

    onSessionChange(cb) {
      // 어느 쪽이 바뀌든 "지금 누구인가"를 다시 계산해 한 번만 알린다.
      const relay = () => cb(session());
      const offReal = real.onSessionChange(relay);
      const offGuest = guest.onSessionChange(relay);
      return () => { offReal(); offGuest(); };
    },

    async ready() { await Promise.all([real.ready(), guest.ready()]); },

    get canUploadCover() { return active().canUploadCover; },

    async signUp(input) {
      const r = await real.signUp(input);
      await dropGuest();
      return r;
    },
    async signIn(input) {
      await real.signIn(input);
      await dropGuest();
    },
    // 재설정은 정식 계정의 일이다. 체험 세션에는 비밀번호가 없다.
    requestPasswordReset: (email) => real.requestPasswordReset(email),
    resetPassword: (input) => real.resetPassword(input),

    enterAsGuest: () => guest.enterAsGuest(),
    async signOut() {
      // 어느 쪽으로 들어왔든 나가면 둘 다 비운다.
      if (real.getSession()) await real.signOut();
      await dropGuest();
    },

    updateDisplayName: (name) => active().updateDisplayName(name),

    listBoxes: () => active().listBoxes(),
    getBox: (id) => active().getBox(id),
    createBox: (input) => active().createBox(input),
    joinBox: (input) => active().joinBox(input),
    renameBox: (id, name) => active().renameBox(id, name),
    setMyColors: (id, colors) => active().setMyColors(id, colors),
    leaveBox: (id) => active().leaveBox(id),

    listEnvelopes: (id, vol) => active().listEnvelopes(id, vol),
    sendTelegram: (id, body) => active().sendTelegram(id, body),
    deleteTelegram: (id) => active().deleteTelegram(id),

    beginReading: (id) => active().beginReading(id),
    closeVolume: (id, input) => active().closeVolume(id, input),

    listVolumes: (id) => active().listVolumes(id),
    getVolumePages: (id) => active().getVolumePages(id),
    uploadCover: (id, file) => active().uploadCover(id, file),
    coverUrl: (path) => active().coverUrl(path),
  };
}
