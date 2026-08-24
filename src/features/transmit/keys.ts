/**
 * 물리 키 → 타자기 사진 위의 자리.
 *
 * `KeyboardEvent.code` 로 찾는다. `key` 가 아니다 — 한글을 칠 때 `key` 는 조합 중인
 * 글자거나 'Process' 로 오는데, `code` 는 자판 배열과 무관하게 **누른 자리**를 그대로
 * 준다. 참조 구현은 한글이면 아무 자리나 반짝이게 했다. (docs/AUDIT.md §04-3)
 *
 * 좌표는 사진 크기에 대한 백분율이고, 지금 에셋(Olivetti Lettera 32, 1200×1200)에서
 * 키캡 중심을 직접 재서 넣은 값이다.
 *
 *   숫자열  y 52.8   x 29.8 부터 4.5 간격
 *   QWERTY  y 57.3   x 27.2 부터
 *   ASDF    y 61.6   x 28.2 부터
 *   ZXCV    y 66.2   x 29.4 부터
 *
 * **사진을 바꾸면 이 표를 다시 재야 한다.** docs/typewriter-photos.md 가 여덟 장의
 * 프레이밍을 픽셀 단위로 맞추라고 한 이유가 이것이다 — 프레이밍이 같으면 표는 그대로다.
 */

export interface KeyPos { readonly x: number; readonly y: number }

/** 하이라이트 지름 (사진 폭에 대한 %). 키캡보다 살짝 작게 잡아 옆 키를 물지 않는다. */
export const KEY_SIZE = 3.6;

const row = (y: number, x0: number, codes: readonly string[]): [string, KeyPos][] =>
  codes.map((code, i) => [code, { x: +(x0 + i * 4.5).toFixed(2), y }]);

const LAYOUT = new Map<string, KeyPos>([
  ...row(52.8, 29.8, ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0']),
  ...row(57.3, 27.2, ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP']),
  ...row(61.6, 28.2, ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL']),
  ...row(66.2, 29.4, ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period']),
]);

/** 사진에 자리가 없는 키(스페이스·엔터 등)는 null. 해머는 움직이지 않는다. */
export const keyPos = (code: string): KeyPos | null => LAYOUT.get(code) ?? null;

/** 눈으로 자리를 확인할 때 쓴다. tools/ui-check-transmit.mjs 참고. */
export const ALL_KEYS: readonly KeyPos[] = [...LAYOUT.values()];

/** 글자를 만들어 내는 키인가. 수식·이동 키에는 타건음을 내지 않는다. */
export function isTypingKey(e: React.KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key;
  if (k === 'Backspace' || k === 'Delete') return true;
  if (k.length === 1) return true;
  // 한글 조합 중에는 key 가 'Process' 로 온다. code 로 판정한다.
  return k === 'Process' || LAYOUT.has(e.code);
}
