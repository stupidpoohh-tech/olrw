#!/usr/bin/env python3
"""
이끼 타자기의 타건음을 실제 녹음에서 잘라낸다. (docs/decisions.md D18)

    python3 tools/moss-cut.py <풀밭 영상.mov>

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
SR_OUT = 22050          # 참나무와 같다. 11kHz 대역이면 풀 스치는 소리는 다 담긴다
COUNT = 6               # 벌 수. 한 벌만 쓰면 두 글자만 쳐도 복사한 소리로 들린다
LEN_S = 0.145           # 한 벌 길이
PRE_S = 0.008           # 어택 앞을 조금 남긴다 — 딱 맞춰 자르면 시작이 잘려 딱 소리가 난다
GAP_S = 0.17            # 벌끼리 이만큼은 떨어져 있어야 서로 다른 소리가 된다

ATTACK_S = 0.006        # 페이드 인. 이보다 짧으면 '틱' 하고 튄다
TAIL_FRAC = 0.55        # 뒤쪽 이만큼을 반코사인으로 눕혀 스르르 가라앉힌다
TARGET_RMS = 0.10       # 벌마다 이 크기로 맞춘다
PEAK_CEIL = 0.89        # 그 뒤 최대치를 여기로 눌러 둔다


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
    # 어택의 세기 × 뒤따르는 소리의 두께로 고른다. 어택만 세고 몸통이 없으면 '탁' 이다.
    scored = []
    for i, s in enumerate(tt):
        if flux[i] < 0.25 or s - PRE_S < 0 or s + need > len(x) / SR_IN:
            continue
        seg = hp[int(s * SR_IN):int((s + need) * SR_IN)]
        scored.append((flux[i] * np.sqrt((seg ** 2).mean()), s))
    scored.sort(reverse=True)

    picked: list[float] = []
    for _, s in scored:
        if all(abs(s - p) >= GAP_S for p in picked):
            picked.append(s)
        if len(picked) == COUNT:
            break
    return sorted(picked)


def shape(seg: np.ndarray) -> np.ndarray:
    """한 벌을 듣기 좋게 다듬는다.

    자른 그대로는 ① 바람 럼블이 깔려 웅 하고 ② 시작이 툭 끊겨 딱 소리가 나고
    ③ 끝이 뚝 잘려 클릭이 남는다. 셋을 차례로 없앤다.
    """
    # ① 럼블 제거. 위상까지 지키려고 filtfilt 를 쓴다 — 어택 모양이 흐트러지면 안 된다.
    seg = sosfiltfilt(butter(4, 160, 'hp', fs=SR_IN, output='sos'), seg)
    # 8kHz 위를 조금 눕힌다. 그대로 두면 '치' 하는 쇳소리가 남아 오래 듣기 나쁘다.
    hiss = sosfiltfilt(butter(2, 8000, 'hp', fs=SR_IN, output='sos'), seg)
    seg = seg - 0.45 * hiss
    seg = seg - seg.mean()

    n = len(seg)
    env = np.ones(n)
    # ② 어택 — 코사인으로 부드럽게 연다
    a = min(int(ATTACK_S * SR_IN), n // 4)
    env[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    # ③ 꼬리 — 뒤쪽을 반코사인으로 눕혀 0 에서 끝나게 한다
    tail = int(n * TAIL_FRAC)
    env[n - tail:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, tail))
    return seg * env


def to_int16(x: np.ndarray) -> np.ndarray:
    """TPDF 디더를 얹어 16bit 로 내린다. 조용한 소리라 디더 없이는 꼬리가 거칠다."""
    d = (np.random.random(len(x)) - np.random.random(len(x))) / 32768
    return np.clip(np.round((x + d) * 32767), -32768, 32767).astype('<i2')


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    video = Path(sys.argv[1])
    if not video.exists():
        print(f'없는 파일입니다: {video}')
        return 1

    x = read_audio(video)
    print(f'원본 {len(x) / SR_IN:.2f}s · 최대 {np.abs(x).max():.3f} · rms {np.sqrt((x ** 2).mean()):.4f}')

    picked = onsets(x)
    if len(picked) < COUNT:
        print(f'어택을 {len(picked)}곳밖에 못 찾았습니다. GAP_S 를 줄여 보세요.')
        return 1

    cuts = []
    for s in picked:
        i = int((s - PRE_S) * SR_IN)
        cuts.append(shape(x[i:i + int(LEN_S * SR_IN)].copy()))

    # 벌마다 따로 크기를 맞춘다. 한 벌만 4dB 크면 그 글자에서 타이핑이 튄다 —
    # 사람 손가락 만큼의 흔들림은 재생할 때 ±8% 로 이미 넣고 있다 (sounds.ts).
    cuts = [c * (TARGET_RMS / np.sqrt((c ** 2).mean())) for c in cuts]
    peak = max(np.abs(c).max() for c in cuts)
    if peak > PEAK_CEIL:
        cuts = [c * (PEAK_CEIL / peak) for c in cuts]

    print(f'\n{COUNT} 벌 · 각 {LEN_S * 1000:.0f}ms · {SR_OUT}Hz')
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for n, (s, c) in enumerate(zip(picked, cuts), 1):
        y = resample_poly(c, SR_OUT, SR_IN)
        path = OUT_DIR / f'moss-key-{n}.wav'
        with wave.open(str(path), 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR_OUT)
            w.writeframes(to_int16(y).tobytes())
        print(f'  {path.name}  원본 {s:5.3f}s  최대 {np.abs(y).max():.2f}  '
              f'rms {np.sqrt((y ** 2).mean()):.3f}  {path.stat().st_size / 1024:.1f}KB')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
