/**
 * 타자기색이 실제로 구분되는지 잰다. (docs/PORTING-SPEC.md §4-2)
 *
 * §4-2 의 filter 는 "원본 사진이 채도 높은 청록색"임을 전제한다. 전제가 깨지면
 * 여덟 색이 전부 같은 회색으로 나오는데, 눈으로는 "원래 은은한 톤이라 그렇겠지"
 * 하고 넘어가기 쉽다. 그래서 숫자로 잰다.
 *
 *   pnpm tint:check
 *
 * 본체 픽셀만 골라 필터를 건 뒤 평균색을 구하고, 색끼리의 CIE76 ΔE 를 낸다.
 * ΔE 1 = 겨우 인지 / 2~3 = 나란히 놓으면 구분 / 10+ = 다른 색으로 읽힘.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const MIN_DELTA_E = 8;   // 이보다 가까우면 "구분되는 색"이라고 할 수 없다
const ASSET = '/assets/typewriter.png';

// src/design/colors.ts 에서 id 와 filter 를 그대로 읽는다. 값을 두 벌 두지 않는다.
const src = readFileSync(new URL('../src/design/colors.ts', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('export const TYPE_COLORS'), src.indexOf('/* ── 표지색'));
const FILTERS = [...block.matchAll(/id:\s*'([a-z]+)'[^}]*?filter:\s*'([^']+)'/g)].map((m) => [m[1], m[2]]);
if (FILTERS.length === 0) { console.error('colors.ts 에서 TYPE_COLORS 를 읽지 못했습니다.'); process.exit(1); }

const PORT = process.env.PORT ?? '4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();
try {
  await page.goto(`http://localhost:${PORT}/`, { timeout: 5000 });
} catch {
  console.error(`http://localhost:${PORT} 에 붙지 못했습니다. 먼저 "pnpm build && pnpm preview" 를 띄우세요.`);
  await browser.close();
  process.exit(1);
}

const result = await page.evaluate(async ({ FILTERS, ASSET }) => {
  const img = new Image(); img.src = ASSET; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  // 본체만 고른다: 흰 배경 · 어두운 키캡 · 무채색 부품 제외
  const mask = [];
  ctx.filter = 'none'; ctx.drawImage(img, 0, 0);
  {
    const d = ctx.getImageData(0, 0, W, H).data;
    for (let y = Math.floor(H * 0.3); y < H * 0.8; y += 2)
      for (let x = Math.floor(W * 0.15); x < W * 0.85; x += 2) {
        const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (d[i + 3] < 200 || (mx > 235 && mx - mn < 12) || mx < 70 || mx - mn < 6) continue;
        mask.push(i);
      }
  }
  const means = FILTERS.map(([id, f]) => {
    ctx.clearRect(0, 0, W, H); ctx.filter = f; ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    let r = 0, g = 0, b = 0;
    for (const i of mask) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    return [id, Math.round(r / mask.length), Math.round(g / mask.length), Math.round(b / mask.length)];
  });
  return { n: mask.length, means };
}, { FILTERS, ASSET });

await browser.close();

const toLab = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [f(r), f(g), f(b)];
  let X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [X, Y, Z] = [k(X), k(Y), k(Z)];
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};

console.log(`본체 표본 ${result.n} 픽셀\n`);
for (const [id, r, g, b] of result.means) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  console.log(`  ${id.padEnd(6)} rgb(${String(r).padStart(3)},${String(g).padStart(3)},${String(b).padStart(3)})  채도 ${((mx - mn) / mx).toFixed(3)}`);
}

let min = Infinity, pair = '';
for (let i = 0; i < result.means.length; i++)
  for (let j = i + 1; j < result.means.length; j++) {
    const [, ...a] = result.means[i], [, ...b] = result.means[j];
    const d = Math.hypot(...toLab(a).map((v, k) => v - toLab(b)[k]));
    if (d < min) { min = d; pair = `${result.means[i][0]} ↔ ${result.means[j][0]}`; }
  }

console.log(`\n가장 가까운 두 색: ${pair}   ΔE ${min.toFixed(1)}   (기준 ${MIN_DELTA_E})`);
if (min < MIN_DELTA_E) {
  console.log('\nFAIL  전보함을 색으로 구분할 수 없습니다.');
  console.log('      원인과 선택지는 docs/AUDIT.md §04-5 를 보세요.');
  process.exit(1);
}
console.log('\nPASS  여덟 색이 서로 구분됩니다.');
