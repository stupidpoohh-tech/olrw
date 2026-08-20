/* 용지색을 실제 스타일로 바꾸는 곳. 색과 비색상 단서를 항상 함께 낸다. */
import type { CSSProperties } from 'react';
import { getPaper, getCover, type CoverKind } from './colors';

/**
 * 전보 카드 · 책 페이지의 용지 스타일.
 * 색(bg/edge/ink)과 테두리 스타일(비색상 단서)이 한 곳에서 나오므로,
 * 한쪽만 빠뜨릴 수 없다. (docs/AUDIT.md §04-4)
 */
export function paperStyle(id: string | null | undefined): CSSProperties {
  const p = getPaper(id);
  return {
    background: p.bg,
    color: p.ink,
    borderStyle: p.edgeStyle,
    borderWidth: p.edgeWidth,
    borderColor: p.edge,
  };
}

/** 참여자 칩 · 카드 머리의 작은 스와치. 같은 단서를 작은 크기로 반복한다. */
export function paperSwatchStyle(id: string | null | undefined): CSSProperties {
  const p = getPaper(id);
  return {
    background: p.bg,
    borderStyle: p.edgeStyle,
    borderWidth: p.edgeWidth,
    borderColor: p.edge,
  };
}

/** 책등 · 표지. 사진 표지는 Storage URL 을 그대로 받는다. base64 금지. */
export function coverBackground(kind: CoverKind, value: string): string {
  if (kind === 'photo') return `center / cover no-repeat url("${value}")`;
  return getCover(value).gradient;
}
