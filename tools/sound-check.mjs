/**
 * 타자기 소리를 잰다. (docs/PORTING-SPEC.md §6-1, docs/decisions.md D9)
 *
 *   pnpm sound:check
 *
 * 합성 코드를 OfflineAudioContext 로 렌더링해서 파형을 직접 본다. 오디오는 조용히
 * 망가진다 — 노드 연결 하나가 빠져도 화면은 멀쩡하고 소리만 안 난다.
 *
 * 두 가지를 본다.
 *   1) 소리마다 들릴 만한 크기와 정해진 길이가 나오는가
 *   2) **네 대의 타자기가 실제로 다르게 들리는가** — 벨은 지정한 주파수에서 가장 세고,
 *      타건음의 무게중심은 강철에서 참나무로 갈수록 낮아져야 한다
 *   3) 참나무는 **녹음이 실제로 울리는가** — 못 받아오면 조용히 합성으로 떨어지므로
 *      길이로 가른다. 녹음은 62ms, 합성 fallback 은 100ms 다. (D15)
 */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = async (rel) => (await build({
  entryPoints: [fileURLToPath(new URL(rel, import.meta.url))],
  bundle: true, format: 'esm', write: false, platform: 'browser', target: 'es2022',
  loader: { '.webp': 'dataurl', '.wav': 'dataurl' },
})).outputFiles[0].text;

const soundsSrc = await bundle('../src/lib/sounds.ts');
const twSrc = await bundle('../src/design/typewriters.ts');

/** 소리마다 만족해야 할 크기와 길이. 강철 기준으로 잰다. */
const SHAPE = {
  playKey:    { minPeak: 0.05, dur: [0.06, 0.15], note: '타건음' },
  playBell:   { minPeak: 0.05, dur: [0.70, 0.90], note: '여백 벨' },
  playReturn: { minPeak: 0.05, dur: [0.40, 0.55], note: '캐리지' },
  playRoll:   { minPeak: 0.01, dur: [0.55, 0.65], note: '종이 (제본 공통)' },
  playStamp:  { minPeak: 0.10, dur: [0.08, 0.14], note: '도장 (제본 공통)' },
};

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage();
await page.goto('about:blank');

const data = await page.evaluate(async ({ soundsSrc, twSrc, shapeNames }) => {
  const load = (s) => import(URL.createObjectURL(new Blob([s], { type: 'text/javascript' })));
  const snd = await load(soundsSrc);
  const tw = await load(twSrc);
  // 녹음(.wav 은 data: 로 번들됐다)을 다 받은 뒤에 재야 fallback 을 재지 않는다.
  await snd.keySamplesReady;
  const RATE = 44100;

  const render = async (synth) => {
    const ctx = new OfflineAudioContext(1, RATE * 1.2, RATE);
    synth(ctx, ctx.destination, 0);
    const d = (await ctx.startRendering()).getChannelData(0);
    let peak = 0, last = 0;
    for (let i = 0; i < d.length; i++) {
      const v = Math.abs(d[i]);
      if (v > peak) peak = v;
      if (v > 0.002) last = i;
    }
    // 어택이 얼마나 급한가 — 때리는 소리와 스치는 소리를 가르는 값이다.
    // 무게중심(음색)만으로는 둘이 겹칠 수 있어도, 이건 겹치지 않는다.
    let rise = 0;
    while (rise < d.length && Math.abs(d[rise]) < peak * 0.8) rise++;
    return { d, peak, last, rise };
  };
  const mag = (r, freq) => {
    const k = (2 * Math.PI * freq) / RATE, coeff = 2 * Math.cos(k);
    let s1 = 0, s2 = 0;
    for (let i = 0; i <= r.last; i++) { const s0 = r.d[i] + coeff * s1 - s2; s2 = s1; s1 = s0; }
    return Math.sqrt(Math.max(0, s1*s1 + s2*s2 - coeff*s1*s2)) / (r.last + 1);
  };
  /** 스펙트럼 무게중심 — 소리가 얼마나 "높은" 쪽인가. */
  const centroid = (r) => {
    let num = 0, den = 0;
    for (let f = 100; f <= 6000; f += 100) { const m = mag(r, f); num += f * m; den += m; }
    return den ? num / den : 0;
  };
  /**
   * 스펙트럼 평탄도 — 소리결. 음(音)이면 몇 군데만 솟아 0 에 가깝고,
   * 잡음이면 고르게 퍼져 1 에 가깝다. 물방울과 풀을 가르는 것은 이 값이다.
   */
  const flatness = (r) => {
    let logSum = 0, sum = 0, n = 0;
    for (let f = 100; f <= 6000; f += 100) {
      const m = mag(r, f) + 1e-12; logSum += Math.log(m); sum += m; n++;
    }
    return Math.exp(logSum / n) / (sum / n);
  };

  const steel = tw.TYPEWRITERS[0].voice;
  const shape = {};
  for (const name of shapeNames) {
    const make = snd.SYNTHS[name] ?? snd.RITUAL_SYNTHS[name];
    const r = await render(snd.SYNTHS[name] ? make(steel) : make);
    shape[name] = { peak: +r.peak.toFixed(4), duration: +(r.last / RATE).toFixed(3) };
  }

  const voices = [];
  for (const t of tw.TYPEWRITERS) {
    // 랜덤 성분이 있으니 여러 번 내서 평균을 본다
    let c = 0;
    for (let i = 0; i < 5; i++) c += centroid(await render(snd.SYNTHS.playKey(t.voice)));
    const bellR = await render(snd.SYNTHS.playBell(t.voice));
    const probes = {};
    for (const f of [1500, 1900, 2200, 2900, 2250, 2850, 3300, 4350]) probes[f] = mag(bellR, f);
    const keyR = await render(snd.SYNTHS.playKey(t.voice));
    let fl = 0;
    for (let i = 0; i < 5; i++) fl += flatness(await render(snd.SYNTHS.playKey(t.voice)));
    voices.push({ id: t.id, label: t.label, kind: t.voice.key.kind,
                  keyDur: +(keyR.last / RATE).toFixed(3),
                  keyRise: +(keyR.rise / RATE * 1000).toFixed(1),
                  keyFlat: +(fl / 5).toFixed(3),
                  keyCentroid: Math.round(c / 5),
                  bell: t.voice.bell, bellMag: probes, off: mag(bellR, 700) });
  }
  return { shape, voices };
}, { soundsSrc, twSrc, shapeNames: Object.keys(SHAPE) });

await browser.close();

let failed = 0;
const ok = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   ${detail}` : ''}`);
  if (!cond) failed++;
};

console.log('━━━ 소리의 크기와 길이 (강철 기준) ━━━\n');
for (const [name, spec] of Object.entries(SHAPE)) {
  const r = data.shape[name];
  console.log(`${name}  (${spec.note})   peak ${r.peak}  길이 ${r.duration}s`);
  ok(`  들릴 만한 소리를 낸다`, r.peak >= spec.minPeak, `peak ${r.peak} ≥ ${spec.minPeak}`);
  ok(`  길이가 ${spec.dur[0]}~${spec.dur[1]}s 다`,
     r.duration >= spec.dur[0] && r.duration <= spec.dur[1], `${r.duration}s`);
}

console.log('\n━━━ 네 대가 다르게 들리는가 (D9) ━━━\n');
for (const v of data.voices) {
  console.log(`  ${v.id.padEnd(6)} ${v.label.padEnd(4)} [${v.kind.padEnd(6)}] 무게중심 ${String(v.keyCentroid).padStart(4)}Hz  어택 ${String(v.keyRise).padStart(5)}ms  소리결 ${v.keyFlat.toFixed(2)}  벨 ${v.bell.join(' / ')}Hz`);
}
console.log('');

for (const v of data.voices) {
  const [f1, f2] = v.bell;
  ok(`${v.label} 벨이 ${f1}Hz 에서 울린다`, v.bellMag[f1] > v.off * 3,
     `${v.bellMag[f1].toFixed(5)} vs 700Hz ${v.off.toFixed(5)}`);
  ok(`${v.label} 벨이 ${f2}Hz 에서도 울린다`, v.bellMag[f2] > v.off * 3,
     `${v.bellMag[f2].toFixed(5)}`);
}

const by = Object.fromEntries(data.voices.map((v) => [v.id, v.keyCentroid]));
// 네 대가 각자 다른 종류의 소리를 낸다. 설탕은 버블, 이끼는 물방울(드롭렛),
// 강철·참나무는 스트라이크(강철이 위).
const kinds = Object.fromEntries(data.voices.map((v) => [v.id, v.kind]));
ok('설탕은 버블이다', kinds.sugar === 'bubble', `sugar.kind = ${kinds.sugar}`);
ok('강철은 스트라이크다', kinds.steel === 'strike', `steel.kind = ${kinds.steel}`);
ok('참나무는 녹음이다 (D15)', kinds.oak === 'sample', `oak.kind = ${kinds.oak}`);
ok('이끼는 녹음이다 (D18)', kinds.moss === 'sample', `moss.kind = ${kinds.moss}`);

// 녹음을 못 받아오면 조용히 합성으로 떨어진다. 길이로 가른다.
const dur = Object.fromEntries(data.voices.map((v) => [v.id, v.keyDur]));
ok('참나무 녹음이 실제로 울린다 (합성 fallback 아님)', dur.oak > 0.04 && dur.oak < 0.08,
   `길이 ${dur.oak}s — 녹음 62ms · fallback 100ms`);
ok('이끼 녹음이 실제로 울린다 (물방울 fallback 아님)', dur.moss > 0.12 && dur.moss < 0.19,
   `길이 ${dur.moss}s — 녹음 145ms · fallback 300ms`);

ok('강철이 참나무보다 높게 친다', by.steel > by.oak, `${by.steel}Hz > ${by.oak}Hz`);

// 이끼는 풀 스치는 소리다 (D18). 음색만으로는 강철과 가까워질 수 있지만 —
// 둘은 어택이 다르다. 때리는 소리는 순식간에 서고, 스치는 소리는 천천히 열린다.
// 이 값이 무너지면 ASMR 이 아니라 잡음이 된다.
const rise = Object.fromEntries(data.voices.map((v) => [v.id, v.keyRise]));
ok('이끼는 때리지 않고 스친다', rise.moss > rise.steel * 3 && rise.moss >= 5,
   `이끼 ${rise.moss}ms · 강철 ${rise.steel}ms · 참나무 ${rise.oak}ms`);
const allCentroids = [by.steel, by.oak, by.sugar, by.moss];
const spread = Math.max(...allCentroids) - Math.min(...allCentroids);
ok('네 대의 무게중심이 충분히 벌어져 있다', spread >= 500,
   `가장 높은 것과 낮은 것의 차이 ${spread}Hz`);

// D9 의 약속 — 네 대가 **서로** 다르게 들린다. 한 가지 잣대로는 못 가른다.
// 설탕(물방울)과 이끼(풀)는 무게중심이 130Hz 밖에 안 떨어져 있어도 하나는
// 음이고 하나는 잡음이다. 그래서 셋 중 하나만 벌어져 있으면 통과로 본다:
//   음색(무게중심 250Hz) · 어택(3배) · 소리결(평탄도 2배)
const flat = Object.fromEntries(data.voices.map((v) => [v.id, v.keyFlat]));
const apart = (a, b, f, k) => Math.max(f[a], f[b]) >= Math.min(f[a], f[b]) * k;
const ids = ['steel', 'oak', 'sugar', 'moss'];
const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b]));
const tooClose = pairs.filter(([a, b]) =>
  Math.abs(by[a] - by[b]) < 250 && !apart(a, b, rise, 3) && !apart(a, b, flat, 2));
ok('두 대가 같은 소리로 들리는 짝이 없다', tooClose.length === 0,
   tooClose.length
     ? tooClose.map(([a, b]) => `${a}↔${b}`).join(' ')
     : pairs.map(([a, b]) =>
         `${a}↔${b} ${Math.abs(by[a] - by[b])}Hz`).join(' · '));

console.log(failed ? `\n━━━ 실패 ${failed}건 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
