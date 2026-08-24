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
 * 타건음 — ① 40ms 화이트노이즈 → highpass (활자가 때리는 소리)
 *          ② triangle 해머, 80ms (해머가 플래튼을 치는 소리)
 *
 * 필터 대역과 해머 주파수를 타자기가 정한다. 강철은 높고 마르게, 참나무는 낮고 둔탁하게.
 */
export const key = (v: Voice): Synth => (ctx, out, t0) => {
  const k = v.key;
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 0.04, (t) => Math.exp(-t * k.decay) * 0.18);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = k.hp[0] + Math.random() * (k.hp[1] - k.hp[0]);
  const g = ctx.createGain();
  g.gain.value = 0.8;
  src.connect(hp).connect(g).connect(out);
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
