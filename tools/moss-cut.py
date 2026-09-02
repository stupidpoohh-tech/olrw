#!/usr/bin/env python3
"""
이끼 타자기의 타건음을 실제 녹음에서 잘라낸다. (docs/decisions.md D18)

    python3 tools/moss-cut.py <풀밭 영상.mov> [light|warm|deep]

한 번 돌리고 결과(src/assets/typewriter/moss-key-*.wav)를 리포에 남긴다.
참나무(D15)와 같은 방식이다 — 앱은 잘라 둔 wav 만 받아 쓴다.

원본은 풀밭을 걸어가며 찍은 2.8초짜리 영상이고, 소리는 바지와 다리가 긴 풀을
스치는 것이다. 그중 어택이 뚜렷한 여섯 곳을 골라 한 벌씩 만든다.

필요한 것: ffmpeg · numpy · scipy. 앱 빌드에는 필요 없다.
"""
import sys, wave, subprocess, shutil
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt, sosfiltfilt, stft, resample_poly

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'src/assets/typewriter'

SR_IN = 44100
COUNT = 6               # 벌 수. 한 벌만 쓰면 두 글자만 쳐도 복사한 소리로 들린다
PRE_S = 0.008           # 어택 앞을 조금 남긴다 — 딱 맞춰 자르면 시작이 잘려 딱 소리가 난다
GAP_S = 0.17            # 벌끼리 이만큼은 떨어져 있어야 서로 다른 소리가 된다

ATTACK_S = 0.008        # 페이드 인. 이보다 짧으면 '틱' 하고 튄다
DECAY_S = 0.09          # 전체에 걸리는 감쇠 시상수. 아래 설명 참고
TAIL_FRAC = 0.60        # 뒤쪽 이만큼을 반코사인으로 눕혀 스르르 가라앉힌다
TARGET_RMS = 0.10       # 벌마다 이 크기로 맞춘다
PEAK_CEIL = 0.89        # 그 뒤 최대치를 여기로 눌러 둔다

# ── 톤 ─────────────────────────────────────────────────────────────────────
# 첫 판은 400Hz~11kHz 가 6dB 안에 들어오는 거의 평평한 소리였다. 평평한 광대역
# 잡음은 풀이 아니라 '치지직' 으로 들린다 — 원본의 신호 대 잡음이 6~15dB 뿐이라
# 21dB 를 올리면 마이크 바닥까지 같이 올라오기 때문이다.
#
# 그래서 세 가지를 한다.
#   tilt  1kHz 위를 옥타브당 이만큼 눕힌다 — 자연물은 고역이 완만히 준다
#   lp    이 위는 잘라 낸다 — '치' 하는 자리를 아예 없앤다
#   pitch 이만큼 낮춰 재생한다 (느리게) — 같은 소리가 더 크고 부드러워진다
LEN_S = 0.135           # 자르는 길이(피치를 내리면 그만큼 늘어난다)

WARMTH = {
    #        tilt  lp(Hz)  pitch  설명
    'light': (2.0, 5600, 1.00),   # 밝다. 원래 소리에 가깝다
    'warm':  (3.0, 4200, 0.88),   # 기본. 스치는 소리로 남되 치지직이 사라진다
    'deep':  (4.0, 3000, 0.80),   # 아주 낮다. '슥—' 에 가깝다
}
PRESET = 'warm'


def SR_OUT_BY_LP(lp: float) -> int:
    """저역통과보다 넉넉히 위면 된다. 나이퀴스트가 lp 의 1.3배는 되게."""
    for r in (8000, 11025, 16000, 22050):
        if r / 2 >= lp * 1.3:
            return r
    return 22050


def ffmpeg() -> str:
    exe = shutil.which('ffmpeg')
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def read_audio(video: Path) -> np.ndarray:
    """영상에서 소리만 뽑아 모노 float 로 돌려준다."""
    raw = subprocess.run(
        [ffmpeg(), '-v', 'error', '-i', str(video), '-vn',
         '-ac', '1', '-ar', str(SR_IN), '-f', 's16le', '-'],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768


def onsets(x: np.ndarray) -> list[float]:
    """풀이 스치기 시작하는 지점들. 저역 럼블을 걷어낸 뒤 스펙트럴 플럭스로 찾는다."""
    hp = sosfilt(butter(4, 150, 'hp', fs=SR_IN, output='sos'), x)
    f, t, z = stft(hp, fs=SR_IN, nperseg=1024, noverlap=768)
    band = (f >= 800) & (f <= 9000)              # 풀 스치는 대역
    flux = np.maximum(0, np.diff(np.abs(z)[band], axis=1)).sum(axis=0)
    flux /= flux.max()
    tt = t[1:]

    need = LEN_S - PRE_S
    # 어택의 세기 × 소리의 두께 × **저역 몸통의 비율** 로 고른다.
    #   어택만 세고 몸통이 없으면 '탁' 이고,
    #   고역만 있으면 풀이 아니라 바람 히스다 — 그게 치지직거리는 자리다.
    body = (f >= 300) & (f <= 1800)
    air = (f >= 5000)
    m = np.abs(z)
    step = t[1] - t[0]
    scored = []
    for i, s in enumerate(tt):
        if flux[i] < 0.25 or s - PRE_S < 0 or s + need > len(x) / SR_IN:
            continue
        seg = hp[int(s * SR_IN):int((s + need) * SR_IN)]
        j0, j1 = int(s / step), int((s + need) / step)
        ratio = m[body, j0:j1].mean() / max(m[air, j0:j1].mean(), 1e-9)
        scored.append((flux[i] * np.sqrt((seg ** 2).mean()) * ratio, s))
    scored.sort(reverse=True)

    picked: list[float] = []
    for _, s in scored:
        if all(abs(s - p) >= GAP_S for p in picked):
            picked.append(s)
        if len(picked) == COUNT:
            break
    return sorted(picked)


def tone(seg: np.ndarray, tilt_db_oct: float, lp_hz: float) -> np.ndarray:
    """주파수 축에서 한 번에 톤을 잡는다.

    필터를 여러 개 물리는 대신 곡선 하나를 곱한다. 짧은 조각이고 양 끝이 이미
    0 이라 순환 겹침이 없고, 위상이 그대로라 어택 모양이 흐트러지지 않는다.
    """
    n = len(seg)
    f = np.fft.rfftfreq(n, 1 / SR_IN)
    # 1kHz 위를 옥타브당 tilt_db_oct 씩 눕힌다
    oct_above = np.log2(np.maximum(f, 1000) / 1000)
    h = 10 ** (-tilt_db_oct * oct_above / 20)
    # 그 위에 버터워스 2차 모양의 저역통과 (12dB/oct). 벽처럼 자르지 않는다.
    h *= 1 / np.sqrt(1 + (f / lp_hz) ** 4)
    # 160Hz 아래는 바람 럼블뿐이다
    h *= (f / 160) ** 2 / np.sqrt(1 + (f / 160) ** 4)
    return np.fft.irfft(np.fft.rfft(seg) * h, n)


def shape(seg: np.ndarray, tilt: float, lp: float) -> np.ndarray:
    """한 벌을 듣기 좋게 다듬는다.

    자른 그대로는 ① 대역이 평평해 치지직거리고 ② 바람 럼블이 깔려 웅 하고
    ③ 시작이 툭 끊겨 딱 소리가 나고 ④ 끝이 뚝 잘려 클릭이 남는다.
    """
    seg = tone(seg - seg.mean(), tilt, lp)

    n = len(seg)
    t = np.arange(n) / SR_IN
    # 전체 감쇠. 원본은 걸어가는 소리라 벌에 따라 정점이 60ms 뒤에 오기도 했다 —
    # 그러면 글자를 눌러도 소리가 늦게 부풀어 손가락과 따로 논다. 지수 감쇠를
    # 얹어 어느 벌이든 앞에서 정점을 잡게 한다. 질감은 그대로 남는다.
    env = np.exp(-t / DECAY_S)
    # 어택 — 코사인으로 부드럽게 연다
    a = min(int(ATTACK_S * SR_IN), n // 4)
    env[:a] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    # 꼬리 — 뒤쪽을 반코사인으로 눕혀 0 에서 끝나게 한다
    tail = int(n * TAIL_FRAC)
    env[n - tail:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, tail))
    return seg * env


def to_int16(x: np.ndarray) -> np.ndarray:
    """TPDF 디더를 얹어 16bit 로 내린다. 조용한 소리라 디더 없이는 꼬리가 거칠다."""
    d = (np.random.random(len(x)) - np.random.random(len(x))) / 32768
    return np.clip(np.round((x + d) * 32767), -32768, 32767).astype('<i2')


def main() -> int:
    if not 2 <= len(sys.argv) <= 3:
        print(__doc__)
        return 2
    video = Path(sys.argv[1])
    preset = sys.argv[2] if len(sys.argv) == 3 else PRESET
    if preset not in WARMTH:
        print(f'모르는 프리셋입니다: {preset} (있는 것: {", ".join(WARMTH)})')
        return 1
    if not video.exists():
        print(f'없는 파일입니다: {video}')
        return 1

    x = read_audio(video)
    print(f'원본 {len(x) / SR_IN:.2f}s · 최대 {np.abs(x).max():.3f} · rms {np.sqrt((x ** 2).mean()):.4f}')

    picked = onsets(x)
    if len(picked) < COUNT:
        print(f'어택을 {len(picked)}곳밖에 못 찾았습니다. GAP_S 를 줄여 보세요.')
        return 1

    tilt, lp, pitch = WARMTH[preset]
    cuts = []
    for s in picked:
        i = int((s - PRE_S) * SR_IN)
        cuts.append(shape(x[i:i + int(LEN_S * SR_IN)].copy(), tilt, lp))

    # 벌마다 따로 크기를 맞춘다. 한 벌만 4dB 크면 그 글자에서 타이핑이 튄다 —
    # 사람 손가락 만큼의 흔들림은 재생할 때 ±8% 로 이미 넣고 있다 (sounds.ts).
    cuts = [c * (TARGET_RMS / np.sqrt((c ** 2).mean())) for c in cuts]
    peak = max(np.abs(c).max() for c in cuts)
    if peak > PEAK_CEIL:
        cuts = [c * (PEAK_CEIL / peak) for c in cuts]

    # 피치를 내린다 = 느리게 재생한다. 같은 소리가 더 크고 부드럽게 들린다.
    # 표본율은 잘라 낸 고역에 맞춰 고른다 — 4.2kHz 위가 없는데 11kHz 를 담을
    # 이유가 없다. 파일이 절반으로 준다.
    sr_out = SR_OUT_BY_LP(lp)
    print(f'\n{preset} · tilt {tilt}dB/oct · lp {lp}Hz · pitch ×{pitch}')
    print(f'{COUNT} 벌 · 각 {LEN_S / pitch * 1000:.0f}ms · {sr_out}Hz')
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for n, (s, c) in enumerate(zip(picked, cuts), 1):
        y = resample_poly(c, round(sr_out / pitch), SR_IN)
        path = OUT_DIR / f'moss-key-{n}.wav'
        with wave.open(str(path), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr_out)
            w.writeframes(to_int16(y).tobytes())
        print(f'  {path.name}  원본 {s:5.3f}s  최대 {np.abs(y).max():.2f}  '
              f'rms {np.sqrt((y ** 2).mean()):.3f}  {path.stat().st_size / 1024:.1f}KB')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
