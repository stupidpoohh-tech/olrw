/**
 * 네 대의 타자기가 실제로 구분되는지 잰다. (docs/decisions.md D9)
 *
 *   pnpm tint:check
 *
 * §4-2 는 사진 한 장에 필터를 걸어 여덟 색을 만들려 했는데, 여덟이 전부 같은 회색이
 * 나왔다(ΔE 1.0). 눈으로는 "원래 은은한 톤이라 그렇겠지" 하고 넘어가기 쉬워서 숫자로 잰다.
 *
 * 두 가지를 본다.
 *   1) 네 장의 본체 색이 서로 충분히 떨어져 있는가 (한눈에 다른가)
 *   2) UI 의 점 색(tint)이 서로 충분히 떨어져 있는가 (전환 바에서 구분되는가)
 */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/**
 * 몸통 색은 작은 조각만 재므로 차이를 실제보다 작게 잡는다. 그래서 그림 전체의
 * 차이도 함께 본다 — 실루엣과 장식(이끼·새·크림)까지 들어간다.
 */
const MIN_BODY  = 18;   // 몸통 색끼리 (ΔE)
const MIN_WHOLE = 12;   // 그림 전체 평균 차이 (ΔE)
const MIN_TINT  = 12;   // UI 점끼리 (ΔE)
/** §4-2 원본 팔레트의 채도 상한이 0.44(ochre) 였다. 그 선을 넘지 않는다. */
const MAX_TINT_SAT = 0.44;

const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/design/typewriters.ts', import.meta.url))],
  bundle: true, format: 'esm', write: false, platform: 'browser', target: 'es2022',
  loader: { '.webp': 'dataurl', '.wav': 'dataurl' },
});
const source = outputFiles[0].text;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();
await page.goto('about:blank');

const machines = await page.evaluate(async (src) => {
  const mod = await import(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  const out = [];
  for (const t of mod.TYPEWRITERS) {
    const img = new Image(); img.src = t.src; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    // 자판 바로 위 몸통. 장식(잎·버섯)이 적은 가운데만 본다.
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = Math.floor(H * .40); y < H * .50; y++)
      for (let x = Math.floor(W * .34); x < W * .62; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] < 220) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
    // 그림 전체를 작게 줄여 둔다. 투명한 곳은 페이지 색으로 합성해 실루엣도 반영한다.
    const TW = 64, TH = Math.round(TW * H / W);
    const t2 = document.createElement('canvas'); t2.width = TW; t2.height = TH;
    const tc = t2.getContext('2d');
    tc.fillStyle = '#fafaf8'; tc.fillRect(0, 0, TW, TH);
    tc.drawImage(img, 0, 0, TW, TH);
    const thumb = Array.from(tc.getImageData(0, 0, TW, TH).data);

    out.push({ id: t.id, label: t.label, tint: t.tint, thumb,
               body: n ? [r / n, g / n, b / n].map(Math.round) : [0, 0, 0] });
  }
  return out;
}, source);

await browser.close();

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toLab = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [f(r), f(g), f(b)];
  let X = (R * .4124 + G * .3576 + B * .1805) / .95047;
  let Y = R * .2126 + G * .7152 + B * .0722;
  let Z = (R * .0193 + G * .1192 + B * .9505) / 1.08883;
  const k = (t) => (t > .008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  [X, Y, Z] = [k(X), k(Y), k(Z)];
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
const dE = (a, b) => Math.hypot(...toLab(a).map((v, i) => v - toLab(b)[i]));

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

console.log('타자기 몸통 색과 UI 점 색\n');
for (const m of machines) {
  console.log(`  ${m.id.padEnd(6)} ${m.label.padEnd(4)} 몸통 rgb(${m.body.join(',')})  점 ${m.tint}`);
}
console.log('');

const worst = (key, get) => {
  let min = Infinity, pair = '';
  for (let i = 0; i < machines.length; i++)
    for (let j = i + 1; j < machines.length; j++) {
      const d = dE(get(machines[i]), get(machines[j]));
      if (d < min) { min = d; pair = `${machines[i].id} ↔ ${machines[j].id}`; }
    }
  return { min, pair };
};

const body = worst('body', (m) => m.body);
ok('네 대의 몸통 색이 서로 다르다', body.min >= MIN_BODY,
   `가장 가까운 쌍 ${body.pair} ΔE ${body.min.toFixed(1)} (기준 ${MIN_BODY})`);

// 그림 전체 — 실루엣과 장식까지 들어간다
let wMin = Infinity, wPair = '';
for (let i = 0; i < machines.length; i++)
  for (let j = i + 1; j < machines.length; j++) {
    const A = machines[i].thumb, B = machines[j].thumb;
    let sum = 0, n = 0;
    for (let k = 0; k < A.length; k += 4) {
      sum += dE([A[k], A[k + 1], A[k + 2]], [B[k], B[k + 1], B[k + 2]]);
      n++;
    }
    const avg = sum / n;
    if (avg < wMin) { wMin = avg; wPair = `${machines[i].id} ↔ ${machines[j].id}`; }
  }
ok('그림 전체가 한눈에 다르다', wMin >= MIN_WHOLE,
   `가장 가까운 쌍 ${wPair} 평균 ΔE ${wMin.toFixed(1)} (기준 ${MIN_WHOLE})`);

const tint = worst('tint', (m) => hex2rgb(m.tint));
ok('전환 바의 점 네 개가 구분된다', tint.min >= MIN_TINT,
   `가장 가까운 쌍 ${tint.pair} ΔE ${tint.min.toFixed(1)} (기준 ${MIN_TINT})`);

// UI 점은 §3 의 절제를 지켜야 한다 — 그림은 요란해도 화면 장식은 조용하다
const loud = machines.filter((m) => {
  const [r, g, b] = hex2rgb(m.tint);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx > 0 && (mx - mn) / mx > MAX_TINT_SAT;
});
ok('점 색이 §4-2 원본 팔레트의 절제를 지킨다', loud.length === 0,
   loud.length ? loud.map((m) => `${m.id} ${m.tint}`).join(', ') : `채도 ${MAX_TINT_SAT} 이하`);

console.log(failed ? `\n━━━ 실패 ${failed}건 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
