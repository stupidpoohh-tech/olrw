/**
 * 타건음 음소거 — 기기(브라우저) 단위.
 *
 * 계정에 딸린 설정이 아니다. 도서관에서 열었을 때는 조용히, 집에서 열었을 때는
 * 소리가 나게 — 사람이 아니라 자리를 따라간다. 그래서 localStorage 로 충분하다.
 *
 * `sounds.ts` 가 재생 직전에 이 값을 본다. 켜져 있으면 어떤 소리도 나지 않는다
 * (제본의 종이·도장 소리까지 포함 — "조용히 하고 싶다"는 요구는 전면적이다).
 */

const KEY = 'olrw.muted';
const EVENT = 'olrw:muted-change';

export function isMuted(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setMuted(next: boolean): void {
  try {
    if (next) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* 저장 못 해도 이번 세션은 값이 유지된다 */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
}

export function onMuteChange(cb: (muted: boolean) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<boolean>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}
