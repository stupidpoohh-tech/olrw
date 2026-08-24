/**
 * 타자기 사운드 — docs/PORTING-SPEC.md §6-1
 *
 * 전부 코드로 합성한다. 오디오 에셋 0바이트.
 *
 * 합성 함수는 `BaseAudioContext` 를 받는다. 실제 재생은 `AudioContext`,
 * 검증은 `OfflineAudioContext` 로 같은 코드를 돌린다 — 소리가 나는지
 * 귀로만 확인하면 조용히 망가진 걸 모른다. (tools/sound-check.mjs)
 */

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
 * 타건음 — ① 40ms 화이트노이즈 → highpass 1200~2000Hz (활자가 때리는 소리)
 *          ② triangle 120~160Hz → 60Hz, 80ms (해머가 플래튼을 치는 소리)
 */
export const KEY: Synth = (ctx, out, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 0.04, (t) => Math.exp(-t * 180) * 0.18);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200 + Math.random() * 800;
  const g = ctx.createGain();
  g.gain.value = 0.8;
  src.connect(hp).connect(g).connect(out);
  src.start(t0);

  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(120 + Math.random() * 40, t0);
  osc.frequency.exponentialRampToValueAtTime(60, t0 + 0.06);
  og.gain.setValueAtTime(0.08, t0);
  og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
  osc.connect(og).connect(out);
  osc.start(t0);
  osc.stop(t0 + 0.1);
};

/** 여백 벨 — sine 2200Hz + 3300Hz 동시, 800ms 감쇠. */
export const BELL: Synth = (ctx, out, t0) => {
  [2200, 3300].forEach((freq, i) => {
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
 * 캐리지 리턴 — 350ms 노이즈를 bandpass 800→300Hz 로 쓸고, 280ms 뒤 sine 80Hz 쿵.
 *
 * 쿵은 setTimeout 이 아니라 t0 + 0.28 로 예약한다. 참조 구현은 setTimeout 을 썼는데
 * 탭이 바쁘면 밀린다 — 스펙이 말한 "280ms 뒤"는 벽시계가 아니라 소리의 시각이다.
 */
export const RETURN: Synth = (ctx, out, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx, 0.35, (t) => (1 - t / 0.35) * 0.12);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(800, t0);
  bp.frequency.exponentialRampToValueAtTime(300, t0 + 0.3);
  src.connect(bp).connect(out);
  src.start(t0);

  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = 80;
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
export const SYNTHS = { playKey: KEY, playBell: BELL, playReturn: RETURN, playRoll: ROLL, playStamp: STAMP } as const;

export interface TypeSound {
  playKey(): void;
  playBell(): void;
  playReturn(): void;
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
  playKey: () => play(KEY),
  playBell: () => play(BELL),
  playReturn: () => play(RETURN),
  playRoll: () => play(ROLL),
  playStamp: () => play(STAMP),
};
