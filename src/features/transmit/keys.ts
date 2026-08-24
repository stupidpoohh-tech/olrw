/**
 * 물리 키 → 타자기 사진 위의 자리.
 *
 * `KeyboardEvent.code` 로 찾는다. `key` 가 아니다 — 한글을 칠 때 `key` 는 조합 중인
 * 글자거나 'Process' 로 오는데, `code` 는 자판 배열과 무관하게 **누른 자리**를 그대로
 * 준다. 참조 구현은 한글이면 아무 자리나 반짝이게 했다. (docs/AUDIT.md §04-3)
 *
 * 좌표는 타자기마다 다르다. 네 대의 사진이 프레이밍이 서로 달라서, 자리표를
 * `src/design/typewriters.ts` 의 `rows` 가 타자기별로 들고 있다.
 */
import type { Typewriter } from '../../design/typewriters';

const ROWS: readonly (readonly string[])[] = [
  ['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'],
  ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP'],
  ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL'],
  ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period'],
];

/** 자판에 자리가 있는 키인지. 스페이스·엔터 등은 해머를 움직이지 않는다. */
const INDEX = new Map<string, readonly [row: number, col: number]>();
ROWS.forEach((row, r) => row.forEach((code, c) => INDEX.set(code, [r, c] as const)));

export interface KeyPos { readonly x: number; readonly y: number; readonly size: number }

/** 자리가 없는 키는 null. */
export function keyPos(tw: Typewriter, code: string): KeyPos | null {
  const at = INDEX.get(code);
  if (!at) return null;
  const row = tw.rows[at[0]];
  if (!row) return null;
  return {
    x: +(row.x0 + at[1] * row.gap).toFixed(2),
    y: row.y,
    // 하이라이트는 키캡보다 조금 작게. 간격에 비례하니 사진 크기가 달라도 맞는다.
    size: +(row.gap * 0.78).toFixed(2),
  };
}

/** 글자를 만들어 내는 키인가. 수식·이동 키에는 타건음을 내지 않는다. */
export function isTypingKey(e: React.KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key;
  if (k === 'Backspace' || k === 'Delete') return true;
  if (k.length === 1) return true;
  // 한글 조합 중에는 key 가 'Process' 로 온다. code 로 판정한다.
  return k === 'Process' || INDEX.has(e.code);
}

/** 자리표를 눈으로 확인할 때 쓴다. tools/ui-check-transmit.mjs 참고. */
export const allKeyPositions = (tw: Typewriter): KeyPos[] =>
  [...INDEX.keys()].map((code) => keyPos(tw, code)).filter((p): p is KeyPos => p !== null);
