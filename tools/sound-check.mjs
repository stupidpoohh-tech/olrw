/**
 * 타자기 사운드가 실제로 소리를 내는지 잰다. (docs/PORTING-SPEC.md §6-1)
 *
 *   pnpm sound:check
 *
 * 합성 코드를 OfflineAudioContext 로 렌더링해서 파형을 직접 본다. 오디오는 조용히
 * 망가지기 쉽다 — 노드 연결 하나가 빠져도 화면은 멀쩡하고 소리만 안 난다.
 */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/**
 * 각 소리가 만족해야 할 것.
 *
 * probe 는 세기를 재 볼 주파수(Hz), tone 은 "이 주파수가 저 주파수보다 세야 한다"는 조건이다.
 * §6-1 이 지정한 주파수가 실제로 나오는지 본다 — 소리가 나기만 하면 통과인 검사는 의미가 없다.
 */
const SPEC = {
  playKey: { minPeak: 0.05, dur: [0.06, 0.15], probe: [300, 3000],
             tone: [3000, 300], note: '타건음 · highpass 1200~2000Hz' },
  playBell: { minPeak: 0.05, dur: [0.70, 0.90], probe: [500, 2200, 3300],
              tone: [2200, 500], tone2: [3300, 500], note: '여백 벨 · sine 2200 + 3300Hz' },
  playReturn: { minPeak: 0.05, dur: [0.40, 0.55], probe: [80, 500, 3000],
                tone: [500, 3000], tone2: [80, 3000], note: '캐리지 슬라이드 800→300Hz + 80Hz 쿵' },
  playRoll: { minPeak: 0.01, dur: [0.55, 0.65], probe: [300, 3000],
              tone: [300, 3000], note: '종이 굴러가는 소리 · lowpass 600Hz' },
  playStamp: { minPeak: 0.10, dur: [0.08, 0.14], probe: [120, 2000],
               tone: [120, 2000], note: '도장 · square 180→60Hz' },
};

// 소스를 그대로 묶어 브라우저에 넣는다. 미리보기 서버도 필요 없다.
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/lib/sounds.ts', import.meta.url))],
  bundle: true, format: 'esm', write: false, platform: 'browser', target: 'es2022',
});
const source = outputFiles[0].text;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();
await page.goto('about:blank');

const results = await page.evaluate(async ({ source, names, probeFreqs }) => {
  const mod = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
  const out = {};
  for (const name of names) {
    const synth = mod.SYNTHS[name];
    const RATE = 44100;
    const ctx = new OfflineAudioContext(1, RATE * 1.2, RATE);
    synth(ctx, ctx.destination, 0);
    const rendered = await ctx.startRendering();
    const d = rendered.getChannelData(0);

    let peak = 0, lastLoud = 0;
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
      if (v > 0.002) lastLoud = i;
    }
    // 저역/고역 대충 비교: 인접 샘플 차이가 크면 고역이 세다
    // Goertzel — 특정 주파수의 세기만 골라 잰다. FFT 를 끌어올 필요가 없다.
    const mag = (freq) => {
      const k = (2 * Math.PI * freq) / RATE;
      const coeff = 2 * Math.cos(k);
      let s1 = 0, s2 = 0;
      for (let i = 0; i <= lastLoud; i++) { const s0 = d[i] + coeff * s1 - s2; s2 = s1; s1 = s0; }
      return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / (lastLoud + 1);
    };
    const probes = {};
    for (const f of probeFreqs[name]) probes[f] = +mag(f).toFixed(5);
    out[name] = { peak: +peak.toFixed(4), duration: +(lastLoud / RATE).toFixed(3), probes };
  }
  return out;
}, {
  source,
  names: Object.keys(SPEC),
  probeFreqs: Object.fromEntries(Object.entries(SPEC).map(([k, v]) => [k, v.probe])),
});

await browser.close();

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

for (const [name, spec] of Object.entries(SPEC)) {
  const r = results[name];
  console.log(`\n${name}  (${spec.note})`);
  console.log(`   peak ${r.peak}   길이 ${r.duration}s   `
    + Object.entries(r.probes).map(([f, m]) => `${f}Hz ${m}`).join('  '));

  ok(`들릴 만한 소리를 낸다`, r.peak >= spec.minPeak, `peak ${r.peak} ≥ ${spec.minPeak}`);
  ok(`길이가 ${spec.dur[0]}~${spec.dur[1]}s 다`,
     r.duration >= spec.dur[0] && r.duration <= spec.dur[1], `${r.duration}s`);

  for (const pair of [spec.tone, spec.tone2].filter(Boolean)) {
    const [strong, weak] = pair;
    const a = r.probes[strong], b = r.probes[weak];
    ok(`${strong}Hz 가 ${weak}Hz 보다 세다`, a > b * 1.5, `${a} vs ${b}`);
  }
}

console.log(failed ? `\n━━━ 실패 ${failed}건 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
