/**
 * 타자기 사운드 — docs/PORTING-SPEC.md §6-1
 *
 * 전부 코드로 합성한다. 오디오 에셋 0바이트.
 *
 * **타전실 소리(타건·벨·캐리지)는 타자기마다 다르다.** 강철은 밝고 날카롭게,
 * 참나무는 낮고 둔탁하게 — 화면을 보지 않아도 어느 전보함인지 안다. (docs/decisions.md D9)
 * **제본 소리(종이·도장)는 공통이다.** 제본은 전보함의 성격이 아니라
 * "만나서 맺는다"는 제품 공통의 의식이다.
 *
 * 합성 함수는 `BaseAudioContext` 를 받는다. 실제 재생은 `AudioContext`,
 * 검증은 `OfflineAudioContext` 로 같은 코드를 돌린다 — 소리가 나는지
 * 귀로만 확인하면 조용히 망가진 걸 모른다. (tools/sound-check.mjs)
 */

import type { Voice } from '../design/typewriters';
import { isMuted } from './mute';

/** 합성 한 조각. t0 는 컨텍스트 기준 시작 시각. */
export type Synth = (ctx: BaseAudioContext, out: AudioNode, t0: number) => void;

/** 감쇠하는 화이트노이즈 버퍼. */
function noise(ctx: BaseAudioContext, seconds: number, amp: (t: number) => number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const t = i / ctx.sampleRate;
    data[i] = (Math.random() * 2 - 1) * amp(t);
  }
  return buf;
}

/**
 * 타건음 — 타자기 종류에 따라 갈라진다. (docs/decisions.md D9)
 *
 * strike (강철·참나무·이끼): 40ms 화이트노이즈 → highpass + triangle 해머. 옵션으로
 *   금속 링(강철), 몸통 저음(참나무), 흡음 lowpass(이끼)를 얹는다.
 * bubble (설탕/푸딩): 활자가 아니라 물방울이다. sine 이 짧게 미끄러지며 떨어지고
 *   그 위에 짧은 반짝(tinkle)이 하나 붙는다. 다른 셋과 성격이 아예 다르다.
 */
export const key = (v: Voice): Synth => {
  switch (v.key.kind) {
    case 'bubble': return bubble(v.key);
    case 'rustle': return rustle(v.key);
    default:       return strike(v.key);
  }
};

type Strike = Extract<Voice['key'], { kind: 'strike' }>;
type Bubble = Extract<Voice['key'], { kind: 'bubble' }>;
type Rustle = Extract<Voice['key'], { kind: 'rustle' }>;

const strike = (k: Strike): Synth => (ctx, out, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 0.04, (t) => Math.exp(-t * k.decay) * 0.18);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = k.hp[0] + Math.random() * (k.hp[1] - k.hp[0]);
  const g = ctx.createGain();
  g.gain.value = 0.8;
  let tail: AudioNode = hp;
  if (k.extraLp !== undefined) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = k.extraLp;
    hp.connect(lp);
    tail = lp;
  }
  src.connect(hp);
  tail.connect(g).connect(out);
  src.start(t0);

  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(k.hammer[0] + Math.random() * (k.hammer[1] - k.hammer[0]), t0);
  osc.frequency.exponentialRampToValueAtTime(k.hammerTo, t0 + 0.06);
  og.gain.setValueAtTime(k.hammerGain, t0);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
  osc.connect(og).connect(out);
  osc.start(t0);
  osc.stop(t0 + 0.1);

  // 강철의 금속 잔향 — 벨과 같은 두 배음, 아주 조용히, 짧게.
  if (k.ring) {
    k.ring.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const rg = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      rg.gain.setValueAtTime(0.0001, t0);
      rg.gain.exponentialRampToValueAtTime(0.025 / (i + 1), t0 + 0.005);
      rg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
      o.connect(rg).connect(out);
      o.start(t0);
      o.stop(t0 + 0.12);
    });
  }

  // 참나무의 몸통 저음 — 해머와 동시에 짧게 얹힌다.
  if (k.thump !== undefined) {
    const o = ctx.createOscillator();
    const tg = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = k.thump;
    tg.gain.setValueAtTime(0.10, t0);
    tg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
    o.connect(tg).connect(out);
    o.start(t0);
    o.stop(t0 + 0.1);
  }
};

/**
 * 물방울이 톡 — 주 pluck 은 sine 이 460~720Hz 에서 220Hz 로 짧게 미끄러진다.
 * 반짝(tinkle)은 3~4kHz 근처에서 40ms — 거품이 터지는 순간의 밝은 반사.
 */
const bubble = (k: Bubble): Synth => (ctx, out, t0) => {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  const from = k.pluck[0] + Math.random() * (k.pluck[1] - k.pluck[0]);
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(k.pluckTo, t0 + 0.08);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + 0.1);

  const t = ctx.createOscillator();
  const tg = ctx.createGain();
  t.type = 'sine';
  t.frequency.value = k.tinkle[0] + Math.random() * (k.tinkle[1] - k.tinkle[0]);
  tg.gain.setValueAtTime(0.0001, t0);
  tg.gain.exponentialRampToValueAtTime(0.09, t0 + 0.003);
  tg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.045);
  t.connect(tg).connect(out);
  t.start(t0);
  t.stop(t0 + 0.05);
};

/**
 * 나뭇잎에 파묻힌 타자기(이끼).
 *
 * 이 타자기만 예외로 실제 녹음을 쓴다 — 사용자가 잎사귀와 이슬 mp3 두 개를
 * 지정했다. 나머지 타자기는 여전히 §6-1 합성을 따른다.
 *
 * 잎(leaf.mp3, ~3s 연속 스침): 매 타건마다 랜덤 오프셋에서 90~140ms 를 꺼내
 *   짧은 페이드-인/아웃과 함께 재생. 늘 다르게 들리게 한다.
 * 이슬(dew.mp3, ~260ms 한 방울): 확률적으로만(30%) 얹는다. 매 키마다 방울
 *   소리가 나면 부담이다 — 자연스럽게 이따금 톡.
 *
 * 첫 재생 순간에는 아직 디코딩이 안 끝났을 수 있다. 그 경우 v.key 의 값들로
 * 합성 폴백을 돌려 소리가 조용히 사라지지 않게 한다.
 */

// 브라우저가 열리자마자 파일은 받아 둔다. AudioContext 가 없을 뿐 아니라
// 첫 클릭 전이라 디코딩은 못하므로 raw bytes 만 캐시.
type Bytes = ArrayBuffer;
const fetchBytes = (url: string): Promise<Bytes> =>
  fetch(url).then((r) => r.arrayBuffer());

let leafBytes: Promise<Bytes> | null = null;
let dewBytes:  Promise<Bytes> | null = null;
let leafBuf: AudioBuffer | null = null;
let dewBuf:  AudioBuffer | null = null;
let decoding = false;

// SSR 안전: window 가 있을 때만 fetch 시작. 실패해도 조용히 폴백된다.
if (typeof window !== 'undefined') {
  leafBytes = fetchBytes('/sounds/moss/leaf.mp3').catch(() => new ArrayBuffer(0));
  dewBytes  = fetchBytes('/sounds/moss/dew.mp3').catch(() => new ArrayBuffer(0));
}

async function ensureBuffers(ctx: BaseAudioContext): Promise<void> {
  if (decoding || (leafBuf && dewBuf)) return;
  if (!leafBytes || !dewBytes) return;
  decoding = true;
  try {
    const [lb, db] = await Promise.all([leafBytes, dewBytes]);
    if (!leafBuf && lb.byteLength > 0) leafBuf = await ctx.decodeAudioData(lb.slice(0));
    if (!dewBuf  && db.byteLength > 0) dewBuf  = await ctx.decodeAudioData(db.slice(0));
  } catch { /* 디코딩 실패 = 폴백으로 조용히 */ }
  finally { decoding = false; }
}

const rustle = (k: Rustle): Synth => (ctx, out, t0) => {
  // 백그라운드로 디코딩을 걸어 둔다. 다음 키부터는 샘플이 뜬다.
  void ensureBuffers(ctx);

  if (leafBuf) {
    const window = 0.09 + Math.random() * 0.05;   // 90~140ms 랜덤 슬라이스
    const maxStart = Math.max(0, leafBuf.duration - window - 0.05);
    const start = 0.05 + Math.random() * maxStart;
    const leafSrc = ctx.createBufferSource();
    leafSrc.buffer = leafBuf;
    const gL = ctx.createGain();
    gL.gain.setValueAtTime(0.0001, t0);
    gL.gain.exponentialRampToValueAtTime(0.55, t0 + 0.006);
    gL.gain.exponentialRampToValueAtTime(0.001, t0 + window);
    leafSrc.connect(gL).connect(out);
    leafSrc.start(t0, start, window);
  }

  // 이슬방울 — 30% 확률. 매 타건마다 톡톡거리면 부담이다.
  if (dewBuf && Math.random() < 0.3) {
    const dewSrc = ctx.createBufferSource();
    dewSrc.buffer = dewBuf;
    const gD = ctx.createGain();
    gD.gain.value = 0.75;
    dewSrc.connect(gD).connect(out);
    dewSrc.start(t0 + 0.015);
  }

  // 폴백 합성 — 샘플이 아직 안 뜬 경우에만 (첫 키 한두 번)
  if (!leafBuf) {
    const src = ctx.createBufferSource();
    const decayRate = 3 / k.leaf.duration;
    src.buffer = noise(ctx, k.leaf.duration, (t) => Math.exp(-t * decayRate) * k.leaf.amp);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = k.leaf.band[0] + Math.random() * (k.leaf.band[1] - k.leaf.band[0]);
    bp.Q.value = 1.3;
    src.connect(bp).connect(out);
    src.start(t0);
  }
};

/** 여백 벨 — 두 배음을 동시에, 800ms 감쇠. 배음은 타자기가 정한다. */
export const bell = (v: Voice): Synth => (ctx, out, t0) => {
  v.bell.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // exponentialRamp 는 0 에서 출발할 수 없다. 아주 작은 값에서 올린다.
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.08 / (i + 1), t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.8);
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + 0.85);
  });
};

/**
 * 캐리지 리턴 — 350ms 노이즈를 bandpass 로 쓸고, 280ms 뒤 낮은 sine 쿵.
 *
 * 쿵은 setTimeout 이 아니라 t0 + 0.28 로 예약한다. 참조 구현은 setTimeout 을 썼는데
 * 탭이 바쁘면 밀린다 — 스펙이 말한 "280ms 뒤"는 벽시계가 아니라 소리의 시각이다.
 */
export const carriage = (v: Voice): Synth => (ctx, out, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 0.35, (t) => (1 - t / 0.35) * 0.12);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(v.carriage.from, t0);
  bp.frequency.exponentialRampToValueAtTime(v.carriage.to, t0 + 0.3);
  src.connect(bp).connect(out);
  src.start(t0);

  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = v.carriage.thud;
  g.gain.setValueAtTime(0.15, t0 + 0.28);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.46);
  o.connect(g).connect(out);
  o.start(t0 + 0.28);
  o.stop(t0 + 0.48);
};

/** 종이가 굴러가는 소리 — 600ms 저진폭 노이즈 → lowpass 600Hz. */
export const ROLL: Synth = (ctx, out, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 0.6, () => 0.04);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  src.connect(lp).connect(out);
  src.start(t0);
};

/** 도장 — square 180→60Hz, 100ms. 금박을 새기는 순간에 한 번. */
export const STAMP: Synth = (ctx, out, t0) => {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(180, t0);
  o.frequency.exponentialRampToValueAtTime(60, t0 + 0.08);
  g.gain.setValueAtTime(0.25, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + 0.12);
};

/** 검증에서 쓴다. 이름과 합성 함수를 한 곳에 둔다. */
export const SYNTHS = { playKey: key, playBell: bell, playReturn: carriage } as const;
export const RITUAL_SYNTHS = { playRoll: ROLL, playStamp: STAMP } as const;

export interface TypeSound {
  /** 타전실 소리 — 타자기마다 다르다 */
  playKey(voice: Voice): void;
  playBell(voice: Voice): void;
  playReturn(voice: Voice): void;
  /** 제본 소리 — 전보함과 무관하게 같다 */
  playRoll(): void;
  playStamp(): void;
}

// ── 재생 ───────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;

/**
 * AudioContext 는 지연 생성한다. 페이지가 열리자마자 만들면 브라우저가
 * 사용자 동작 없는 오디오라며 정지시킨다. 첫 소리는 언제나 클릭이나 타건 뒤다.
 */
function audio(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;   // 소리가 안 나는 것이 화면이 멈추는 것보다 낫다
  }
}

function play(synth: Synth): void {
  if (isMuted()) return;
  try {
    const c = audio();
    if (!c) return;
    synth(c, c.destination, c.currentTime);
  } catch { /* 어떤 이유로든 소리는 조용히 포기한다 */ }
}

export const sounds: TypeSound = {
  playKey: (v) => play(key(v)),
  playBell: (v) => play(bell(v)),
  playReturn: (v) => play(carriage(v)),
  playRoll: () => play(ROLL),
  playStamp: () => play(STAMP),
};
