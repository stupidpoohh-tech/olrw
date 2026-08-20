import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

const getSnapshot = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;

/**
 * 모션을 줄여 달라는 설정을 읽는다.
 *
 * CSS 의 @media 는 안전망일 뿐이다. 제본 애니메이션은 React state 로 phase 를
 * 진행하므로, 애니메이션만 꺼 두면 5.8초 동안 빈 화면을 보게 된다.
 * 타임라인 자체를 건너뛰려면 이 값이 필요하다. (§6-2)
 */
export const useReducedMotion = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, () => false);
