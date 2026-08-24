/**
 * 사진 표지에서 책등 색을 뽑는다.
 *
 * 책등은 34×122px, 1:3.6 스트립이다. 여기에 5:7 사진을 `cover` 로 깔면 가운데
 * 세로 띠만 남아 무엇을 찍었는지 알 수 없고, 금박 글자도 사진 위에서 묻힌다.
 * 실물 책도 책등에는 제목만 있고 사진은 앞표지에 있다.
 *
 * 그래서 책등은 사진의 대표색으로 칠하고, 사진은 머리의 정사각 조각과
 * 책을 펼쳤을 때의 앞표지에서 온전히 보여준다.
 *
 * 스키마를 건드리지 않는다 — 색은 그릴 때 사진에서 계산한다.
 */

const CACHE = new Map<string, string>();
const PENDING = new Map<string, Promise<string>>();

/** 사진을 못 읽을 때 쓰는 중립색. 색 표지 다섯 종 중 하나가 아니라 무채색이다. */
const NEUTRAL = 'linear-gradient(to right, #33322e, #4b4943, #33322e)';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0))
          : mx === g ? (b - r) / d + 2
          : (r - g) / d + 4;
  return [h * 60, s, l];
}

/**
 * 책등 그라디언트를 만든다.
 *
 * 색 표지와 같은 문법이다 — 가로 그라디언트가 책등의 원통형 입체감을 만든다. (§4-3)
 * 명도를 28~42% 로 눌러 금박 글자가 언제나 읽히게 한다.
 */
function spineGradient(h: number, s: number): string {
  const sat = clamp(s * 100, 8, 46);
  const mid = `hsl(${h.toFixed(0)}, ${sat.toFixed(0)}%, 36%)`;
  const edge = `hsl(${h.toFixed(0)}, ${sat.toFixed(0)}%, 24%)`;
  return `linear-gradient(to right, ${edge}, ${mid}, ${edge})`;
}

async function extract(url: string): Promise<string> {
  const img = new Image();
  img.crossOrigin = 'anonymous';   // 캔버스가 오염되면 픽셀을 못 읽는다
  img.src = url;
  await img.decode();

  const W = 18, H = 24;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return NEUTRAL;
  ctx.drawImage(img, 0, 0, W, H);

  const d = ctx.getImageData(0, 0, W, H).data;

  // 채도가 있는 픽셀에 무게를 준다. 그냥 평균 내면 회색으로 수렴한다.
  let x = 0, y = 0, satSum = 0, lightSum = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, l] = rgbToHsl(d[i]!, d[i + 1]!, d[i + 2]!);
    if (l < 0.06 || l > 0.96) continue;         // 완전한 검정·흰색은 색이 없다
    const w = s * s + 0.02;                      // 채도가 높을수록 크게 반영
    const rad = (h * Math.PI) / 180;
    x += Math.cos(rad) * w; y += Math.sin(rad) * w;
    satSum += s * w; lightSum += l * w; n += w;
  }
  if (n === 0) return NEUTRAL;

  // 색상은 원형이라 평균이 아니라 벡터 합으로 낸다. 340°와 20°의 평균은 180°가 아니다.
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return spineGradient(hue, satSum / n);
}

/** 이미 계산된 색. 없으면 null. */
export const cachedTint = (url: string): string | null => CACHE.get(url) ?? null;

/** 대표색을 계산한다. 같은 사진은 한 번만 읽는다. */
export function coverTint(url: string): Promise<string> {
  const hit = CACHE.get(url);
  if (hit) return Promise.resolve(hit);

  let job = PENDING.get(url);
  if (!job) {
    job = extract(url)
      .catch(() => NEUTRAL)   // CORS·디코딩 실패 — 색이 없는 것이 화면이 깨지는 것보다 낫다
      .then((v) => { CACHE.set(url, v); PENDING.delete(url); return v; });
    PENDING.set(url, job);
  }
  return job;
}

export { NEUTRAL as NEUTRAL_SPINE };
