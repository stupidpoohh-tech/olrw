/* ═══════════════════════════════════════════════════════════════════════════
   색 시스템 — docs/PORTING-SPEC.md §4
   제품의 핵심이다. 색은 장식이 아니라 정보다.

     용지색 (PAPER)  = 발신인 구분. 공개. 전보함마다 따로 고른다.
     타자기색 (TYPE) = 전보함 구분. 개인 설정. 나만 본다.
     표지색 (COVER)  = 제본된 권.

   id 목록은 supabase/migrations/0001_init.sql 의 check 제약과 일치해야 한다.
   한쪽만 고치면 DB가 조용히 거부한다.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 용지색 — 발신인 구분 (공개) ─────────────────────────────────────────── */

export const PAPER_IDS = [
  'ivory', 'blush', 'sage', 'powder', 'lilac', 'wheat', 'clay', 'mist',
] as const;
export type PaperId = (typeof PAPER_IDS)[number];

/** 비색상 단서. 색만으로 구분하면 색약 사용자가 발신인을 놓친다. (§4-1) */
export type PaperEdgeStyle = 'solid' | 'dashed' | 'dotted' | 'double';

export interface PaperColor {
  readonly id: PaperId;
  readonly label: string;
  /** 카드 배경 */
  readonly bg: string;
  /** 테두리 · 점 */
  readonly edge: string;
  /** 본문 글자색 */
  readonly ink: string;
  /** 비색상 단서: 테두리 스타일 */
  readonly edgeStyle: PaperEdgeStyle;
  /** 비색상 단서: 테두리 굵기(px). double 은 3px 이상이어야 두 줄로 보인다 */
  readonly edgeWidth: 1 | 2 | 3 | 4;
}

/**
 * 채도를 올리지 말 것 — 흰 종이에 은은히 물든 정도가 의도된 값이다. (§4-1)
 *
 * edgeStyle × edgeWidth 조합이 8개 용지에서 전부 다르다. 정원이 4명이므로
 * 한 전보함 안에서는 언제나 네 개의 서로 다른 테두리가 보인다.
 */
export const PAPER_COLORS = [
  { id: 'ivory',  label: '아이보리',   bg: '#faf5ea', edge: '#eadfc8', ink: '#4b4335', edgeStyle: 'solid',  edgeWidth: 1 },
  { id: 'blush',  label: '블러시',     bg: '#f8eee9', edge: '#ecd7cd', ink: '#5a453d', edgeStyle: 'dashed', edgeWidth: 1 },
  { id: 'sage',   label: '세이지',     bg: '#eef1e6', edge: '#d6ddc7', ink: '#414a38', edgeStyle: 'dotted', edgeWidth: 2 },
  { id: 'powder', label: '파우더',     bg: '#eaf0f2', edge: '#d1dfe3', ink: '#3a4750', edgeStyle: 'double', edgeWidth: 3 },
  { id: 'lilac',  label: '라일락',     bg: '#f0ecf3', edge: '#dcd2e4', ink: '#463f52', edgeStyle: 'solid',  edgeWidth: 2 },
  { id: 'wheat',  label: '밀짚',       bg: '#f6efdb', edge: '#e6d8b8', ink: '#4e442e', edgeStyle: 'dashed', edgeWidth: 2 },
  { id: 'clay',   label: '클레이',     bg: '#f6ebe0', edge: '#e6d3c1', ink: '#544435', edgeStyle: 'dotted', edgeWidth: 1 },
  { id: 'mist',   label: '미스트',     bg: '#e9f1ec', edge: '#cee0d6', ink: '#374a41', edgeStyle: 'double', edgeWidth: 4 },
] as const satisfies readonly PaperColor[];

/* ── 타자기색 — 전보함 구분 (개인 설정) ──────────────────────────────────── */

export const TYPE_IDS = [
  'green', 'teal', 'blue', 'plum', 'rose', 'terra', 'ochre', 'stone',
] as const;
export type TypeId = (typeof TYPE_IDS)[number];

export interface TypeColor {
  readonly id: TypeId;
  readonly label: string;
  /** UI 의 점 · 글로우에 쓰는 대표색 */
  readonly tint: string;
  /** 타자기 사진에 거는 CSS 필터 */
  readonly filter: string;
}

/**
 * 원본 타자기 사진이 청록색이라 **채도를 먼저 낮추고 hue-rotate** 한다.
 * 순서를 바꾸면 색이 탁하고 촌스러워진다 — 1차 시안이 실제로 그렇게 실패했다. (§4-2)
 */
export const TYPE_COLORS = [
  { id: 'green', label: '세이지',     tint: '#8a9d8a', filter: 'saturate(.62) brightness(1.02)' },
  { id: 'teal',  label: '틸',         tint: '#6f9296', filter: 'hue-rotate(18deg) saturate(.6) brightness(1.01)' },
  { id: 'blue',  label: '블루그레이', tint: '#7286a0', filter: 'hue-rotate(48deg) saturate(.5)' },
  { id: 'plum',  label: '플럼',       tint: '#8b7793', filter: 'hue-rotate(102deg) saturate(.42)' },
  { id: 'rose',  label: '더스티로즈', tint: '#a8807f', filter: 'hue-rotate(150deg) saturate(.5) brightness(1.02)' },
  { id: 'terra', label: '테라코타',   tint: '#ab7d63', filter: 'hue-rotate(178deg) saturate(.55) brightness(1.03)' },
  { id: 'ochre', label: '오커',       tint: '#a9925f', filter: 'hue-rotate(205deg) saturate(.55) brightness(1.05)' },
  { id: 'stone', label: '스톤',       tint: '#8d8a83', filter: 'saturate(.1) brightness(1.02)' },
] as const satisfies readonly TypeColor[];

/* ── 표지색 — 제본된 권 ──────────────────────────────────────────────────── */

export const COVER_IDS = ['sage', 'burgundy', 'sand', 'navy', 'charcoal'] as const;
export type CoverId = (typeof COVER_IDS)[number];

/** DB 의 volumes.cover_kind 와 같다. */
export type CoverKind = 'color' | 'photo';

export interface CoverColor {
  readonly id: CoverId;
  readonly label: string;
  /** 가로 그라디언트가 책등의 원통형 입체감을 만든다. (§4-3) */
  readonly gradient: string;
}

export const COVER_COLORS = [
  { id: 'sage',     label: '세이지',  gradient: 'linear-gradient(to right, #4d6357, #6b8577, #4d6357)' },
  { id: 'burgundy', label: '버건디',  gradient: 'linear-gradient(to right, #5c2118, #8b3327, #5c2118)' },
  { id: 'sand',     label: '샌드',    gradient: 'linear-gradient(to right, #806038, #ad8a5a, #806038)' },
  { id: 'navy',     label: '네이비',  gradient: 'linear-gradient(to right, #1e2a3a, #344862, #1e2a3a)' },
  { id: 'charcoal', label: '차콜',    gradient: 'linear-gradient(to right, #1f1c18, #3a3530, #1f1c18)' },
] as const satisfies readonly CoverColor[];

/* ── 조회 ────────────────────────────────────────────────────────────────── */

const paperById = new Map<string, PaperColor>(PAPER_COLORS.map((p) => [p.id, p]));
const typeById  = new Map<string, TypeColor>(TYPE_COLORS.map((t) => [t.id, t]));
const coverById = new Map<string, CoverColor>(COVER_COLORS.map((c) => [c.id, c]));

export const DEFAULT_PAPER = PAPER_COLORS[0];
export const DEFAULT_TYPE  = TYPE_COLORS[0];
export const DEFAULT_COVER = COVER_COLORS[0];

export const isPaperId = (v: unknown): v is PaperId => typeof v === 'string' && paperById.has(v);
export const isTypeId  = (v: unknown): v is TypeId  => typeof v === 'string' && typeById.has(v);
export const isCoverId = (v: unknown): v is CoverId => typeof v === 'string' && coverById.has(v);

/** DB 는 문자열을 돌려준다. 모르는 값이 와도 화면이 깨지지 않게 기본값으로 떨어뜨린다. */
export const getPaper = (id: string | null | undefined): PaperColor =>
  (id && paperById.get(id)) || DEFAULT_PAPER;
export const getType = (id: string | null | undefined): TypeColor =>
  (id && typeById.get(id)) || DEFAULT_TYPE;
export const getCover = (id: string | null | undefined): CoverColor =>
  (id && coverById.get(id)) || DEFAULT_COVER;

/** 새 참여자에게 아직 안 쓰인 색을 준다. 다 찼으면 순환한다. */
export const pickPaper = (used: readonly string[] = []): PaperId =>
  (PAPER_COLORS.find((p) => !used.includes(p.id)) ?? PAPER_COLORS[used.length % PAPER_COLORS.length]!).id;
export const pickType = (used: readonly string[] = []): TypeId =>
  (TYPE_COLORS.find((t) => !used.includes(t.id)) ?? TYPE_COLORS[used.length % TYPE_COLORS.length]!).id;
