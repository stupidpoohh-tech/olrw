/**
 * 실제 녹음한 타건음. (docs/decisions.md D15)
 *
 * 나머지 세 대는 코드로 합성한다. 참나무만 진짜 나무 자판을 녹음해서 쓴다 —
 * 합성으로는 나무가 나무처럼 들리지 않았다.
 *
 * **`decodeAudioData` 를 쓰지 않는다.** 그건 비동기라, 키를 누르는 순간에는
 * 이미 소리가 준비돼 있어야 하는 이쪽 구조와 맞지 않는다. 대신 우리가 만든
 * 16bit PCM WAV 를 직접 뜯는다 — 헤더가 정해져 있으니 간단하고, 무엇보다
 * 동기다. (예전 mp3 시도는 인코더가 앞에 넣는 침묵 50ms 때문에 타건과
 * 어긋났다. WAV 에는 그 침묵이 없다.)
 */

interface Pcm {
  readonly rate: number;
  readonly data: Float32Array;
}

/** 받아 둔 원본. 주소 하나당 한 번만 받는다. */
const pcm = new Map<string, Pcm>();
const inflight = new Map<string, Promise<void>>();
/** 컨텍스트마다 AudioBuffer 를 따로 만든다. 컨텍스트가 바뀌면 버퍼도 못 쓴다. */
const buffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** 16bit PCM 모노 WAV 를 연다. 우리가 만든 파일만 들어오므로 최소한만 본다. */
function parseWav(bytes: ArrayBuffer): Pcm | null {
  const v = new DataView(bytes);
  if (v.byteLength < 44) return null;
  if (v.getUint32(0, false) !== 0x52494646) return null;   // 'RIFF'
  if (v.getUint32(8, false) !== 0x57415645) return null;   // 'WAVE'

  let rate = 0, bits = 0, channels = 1;
  let pos = 12;
  while (pos + 8 <= v.byteLength) {
    const id = v.getUint32(pos, false);
    const size = v.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === 0x666d7420) {                               // 'fmt '
      channels = v.getUint16(body + 2, true);
      rate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === 0x64617461) {                        // 'data'
      if (rate === 0 || bits !== 16) return null;
      const n = Math.floor(Math.min(size, v.byteLength - body) / 2);
      const data = new Float32Array(Math.floor(n / channels));
      // 스테레오가 들어와도 왼쪽만 쓴다. 우리 파일은 모노다.
      for (let i = 0; i < data.length; i++) {
        data[i] = v.getInt16(body + i * channels * 2, true) / 32768;
      }
      return { rate, data };
    }
    pos = body + size + (size & 1);                        // 청크는 짝수 경계
  }
  return null;
}

/** 주소들을 받아 둔다. 여러 번 불러도 한 번만 받는다. 실패해도 던지지 않는다. */
export function preloadKeySamples(srcs: readonly string[]): Promise<void> {
  return Promise.all(srcs.map((src) => {
    if (pcm.has(src)) return Promise.resolve();
    let p = inflight.get(src);
    if (!p) {
      p = fetch(src)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => { const parsed = parseWav(b); if (parsed) pcm.set(src, parsed); })
        .catch(() => { /* 못 받아오면 합성으로 떨어진다 */ })
        .finally(() => inflight.delete(src));
      inflight.set(src, p);
    }
    return p;
  })).then(() => undefined);
}

/**
 * 재생할 수 있는 버퍼. 아직 안 받았으면 null — 부르는 쪽이 합성으로 떨어진다.
 *
 * 버퍼는 녹음 그대로의 표본율(22.05kHz)로 만든다. 컨텍스트가 44.1kHz 여도
 * AudioBufferSourceNode 가 알아서 맞춰 준다.
 */
export function keyBuffer(ctx: BaseAudioContext, src: string): AudioBuffer | null {
  const raw = pcm.get(src);
  if (!raw) return null;
  let perCtx = buffers.get(ctx);
  if (!perCtx) { perCtx = new Map(); buffers.set(ctx, perCtx); }
  let buf = perCtx.get(src);
  if (!buf) {
    buf = ctx.createBuffer(1, raw.data.length, raw.rate);
    // copyToChannel 대신 set — 타입 정의가 Float32Array 의 버퍼 종류까지 따진다.
    buf.getChannelData(0).set(raw.data);
    perCtx.set(src, buf);
  }
  return buf;
}
