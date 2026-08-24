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
 */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = async (rel) => (await build({
  entryPoints: [fileURLToPath(new URL(rel, import.meta.url))],
  bundle: true, format: 'esm', write: false, platform: 'browser', target: 'es2022',
  loader: { '.webp': 'dataurl' },
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
    return { d, peak, last };
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
    voices.push({ id: t.id, label: t.label, kind: t.voice.key.kind,
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
  console.log(`  ${v.id.padEnd(6)} ${v.label.padEnd(4)} [${v.kind.padEnd(6)}] 타건 무게중심 ${String(v.keyCentroid).padStart(4)}Hz   벨 ${v.bell.join(' / ')}Hz`);
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
// 설탕은 이제 bubble — 다른 종류의 소리다. 정체성이 실제로 다른지 kind 로 검증한다.
// 나머지 셋(strike)은 여전히 강철 > 이끼 > 참나무 순서를 유지해야 한다.
const kinds = Object.fromEntries(data.voices.map((v) => [v.id, v.kind]));
ok('설탕은 버블이다 (다른 종류의 소리)', kinds.sugar === 'bubble', `sugar.kind = ${kinds.sugar}`);
ok('강철·참나무·이끼는 스트라이크다', kinds.steel === 'strike' && kinds.oak === 'strike' && kinds.moss === 'strike');
ok('강철이 이끼보다 높게 친다', by.steel > by.moss, `${by.steel}Hz > ${by.moss}Hz`);
ok('이끼가 참나무보다 높게 친다', by.moss > by.oak, `${by.moss}Hz > ${by.oak}Hz`);
const strikeCentroids = ['steel', 'moss', 'oak'].map((id) => by[id]);
const spread = Math.max(...strikeCentroids) - Math.min(...strikeCentroids);
ok('세 스트라이크가 충분히 벌어져 있다', spread >= 400, `가장 높은 것과 낮은 것의 차이 ${spread}Hz`);

console.log(failed ? `\n━━━ 실패 ${failed}건 ━━━` : '\n━━━ 전부 통과 ━━━');
process.exit(failed ? 1 : 0);
