import { getType, type TypeId } from './colors';

/**
 * 타자기 사진을 고른다. (docs/decisions.md D9)
 *
 * 색깔별 사진이 들어오면 그것을 쓰고, 아직 없는 색은 기존 단일 사진에
 * §4-2 의 필터를 걸어 폴백한다. 여덟 장이 한꺼번에 들어오지 않아도 화면이 깨지지 않는다.
 *
 * 규격은 docs/typewriter-photos.md. 파일명은 TYPE_COLORS[].id 와 같아야 한다.
 */
const PHOTOS = import.meta.glob<string>('../assets/typewriter/*.{webp,png,jpg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

const byId = new Map<string, string>(
  Object.entries(PHOTOS).map(([path, url]) => [
    path.replace(/^.*\//, '').replace(/\.[^.]+$/, ''),
    url,
  ]),
);

/** 폴백용 원본. 채도가 이미 낮아 필터가 거의 듣지 않는다 — docs/AUDIT.md §04-5 */
const FALLBACK_SRC = '/assets/typewriter.png';

export interface TypewriterArt {
  readonly src: string;
  /** 색깔별 사진이 있으면 필터를 걸지 않는다. */
  readonly filter: string | undefined;
  /** 아직 폴백 중인지. 개발 중 확인용. */
  readonly isFallback: boolean;
}

export function typewriterArt(id: TypeId): TypewriterArt {
  const photo = byId.get(id);
  if (photo) return { src: photo, filter: undefined, isFallback: false };
  return { src: FALLBACK_SRC, filter: getType(id).filter, isFallback: true };
}

/** 여덟 색 사진이 전부 들어왔는가. */
export const hasAllPhotos = (ids: readonly TypeId[]): boolean => ids.every((id) => byId.has(id));
