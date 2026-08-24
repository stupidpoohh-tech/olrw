/** 화면에 보이는 날짜·시각 표기를 한 곳에 모은다. */

const pad = (n: number) => String(n).padStart(2, '0');

/** 카드 · 봉투의 도착 시각. 예) 05.19 18:42 */
export function stamp(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 책의 기간. 예) 2026.05.05 — 05.11 */
export function period(startIso: string, endIso: string): string {
  const a = new Date(startIso);
  const b = new Date(endIso);
  const head = `${a.getFullYear()}.${pad(a.getMonth() + 1)}.${pad(a.getDate())}`;
  const tail = a.getFullYear() === b.getFullYear()
    ? `${pad(b.getMonth() + 1)}.${pad(b.getDate())}`
    : `${b.getFullYear()}.${pad(b.getMonth() + 1)}.${pad(b.getDate())}`;
  return `${head} — ${tail}`;
}

/** 전보 번호. id 뒤 네 자리를 쓴다. 의미는 없고 인쇄물의 인상을 만든다. */
export const serial = (id: string): string => id.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
