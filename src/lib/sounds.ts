/**
 * 타자기 사운드 — docs/PORTING-SPEC.md §6-1
 *
 * **단계 6에서 채운다.** 지금은 호출 지점만 정확히 만들어 두고 소리를 내지 않는다.
 * 타건 이벤트와 한글 입력 처리가 한 몸이라, 이벤트 쪽을 먼저 맞춰 두면
 * 단계 6은 이 파일 안만 채우면 끝난다.
 *
 * 채울 때 지킬 것 (§6-1):
 *   playKey    40ms 화이트노이즈 → highpass 1200~2000Hz + triangle 120~160→60Hz, 80ms
 *   playBell   sine 2200 + 3300Hz, gain .08/.04 → .001 까지 800ms
 *   playReturn 350ms 노이즈를 bandpass 800→300Hz 스윕 + 280ms 뒤 sine 80Hz
 *   playRoll   600ms 저진폭 노이즈 → lowpass 600Hz
 *   playStamp  square 180→60Hz, gain .25 → .001, 100ms
 *
 * AudioContext 는 지연 생성하고 suspended 면 resume 한다. 모든 호출을 try/catch 로 감싼다.
 */

export interface TypeSound {
  playKey(): void;
  playBell(): void;
  playReturn(): void;
  playRoll(): void;
  playStamp(): void;
}

const noop = (): void => {};

/** 단계 6 전까지의 자리. 호출해도 아무 일도 일어나지 않는다. */
export const sounds: TypeSound = {
  playKey: noop,
  playBell: noop,
  playReturn: noop,
  playRoll: noop,
  playStamp: noop,
};
