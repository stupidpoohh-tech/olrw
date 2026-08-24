/**
 * 타자기 — docs/decisions.md D9
 *
 * §4-2 는 사진 한 장에 CSS 필터를 걸어 여덟 색을 만들려 했다. 그런데 필터 여덟 개가
 * 전부 같은 회색을 냈다(가장 가까운 쌍 ΔE 1.0). 전보함을 색으로 구분한다는 장치가
 * 실제로는 동작하지 않았다.
 *
 * 그래서 **색이 아니라 물건**으로 바꿨다. 네 대의 타자기는 생김새도, 소리도 다르다.
 * 화면을 보지 않아도 타건음만으로 어느 전보함에 있는지 안다 — 용지색에 테두리를
 * 짝지은 것과 같은 논리다(§4-1 비색상 단서).
 *
 * 여전히 **개인 설정**이다. 내 화면에서만 보이고, 다른 참여자에게는 보이지 않는다.
 */
import moss from '../assets/typewriter/moss.webp';
import oak from '../assets/typewriter/oak.webp';
import steel from '../assets/typewriter/steel.webp';
import sugar from '../assets/typewriter/sugar.webp';

export const TYPE_IDS = ['steel', 'oak', 'sugar', 'moss'] as const;
export type TypeId = (typeof TYPE_IDS)[number];

/** 자판 한 줄. 사진마다 프레이밍이 달라 타자기마다 따로 잰다. 값은 사진 크기의 %. */
export interface KeyRow {
  /** 키캡 중심의 세로 위치 */
  readonly y: number;
  /** 맨 왼쪽 키의 가로 위치 */
  readonly x0: number;
  /** 키 사이 간격 */
  readonly gap: number;
}

/**
 * 타건음의 성격. 타자기마다 다르다.
 *
 * strike: 활자가 종이를 때리는 기계식 소리. 강철 · 참나무 · 이끼가 이 계열이다.
 *   - ring: 강철만. 활자 뒤에 남는 금속의 잔향(작은 두 배음).
 *   - thump: 참나무만. 해머 뒤에 몸통이 울리는 저음.
 *   - extraLp: 예비. 필요할 때 노이즈 앞단에 얇게 걸어 top-end 를 흡수한다.
 * bubble: 설탕(푸딩)만. 물방울이 톡 하고 터지는 소리 — sine 이 짧게 미끄러지고 반짝 하나.
 */
export type KeyProfile =
  | {
      readonly kind: 'strike';
      readonly decay: number;
      readonly hp: readonly [number, number];
      readonly hammer: readonly [number, number];
      readonly hammerTo: number;
      readonly hammerGain: number;
      readonly ring?: readonly [number, number];
      readonly thump?: number;
      readonly extraLp?: number;
    }
  | {
      readonly kind: 'bubble';
      readonly pluck: readonly [number, number];
      readonly pluckTo: number;
      readonly tinkle: readonly [number, number];
    }
  | {
      /**
       * 이끼 타자기 — 숲속 물방울(ASMR). 타자기 소리를 흉내내지 않는다.
       * sine 이 살짝 가라앉았다가 위로 미끄러지는 고전적인 물방울 처프('블뤼입')에
       * 아주 옅은 촉촉한 노이즈가 깔린다. 설탕(버블: 아래로만 떨어지는 pluck +
       * 높은 tinkle)과는 움직임의 방향이 달라 절대 겹치지 않는다.
       */
      readonly kind: 'droplet';
      readonly start: readonly [number, number];   // 시작 주파수 범위(Hz)
      readonly dip: number;    // 잠깐 가라앉는 바닥
      readonly rise: number;   // 위로 미끄러져 닿는 목표
      readonly moist: number;  // 촉촉한 노이즈 레이어의 크기 (0 이면 없음)
    };

export interface Voice {
  readonly key: KeyProfile;
  /** 여백 벨의 두 배음 */
  readonly bell: readonly [number, number];
  /** 캐리지 — 미끄러지는 대역과 끝의 쿵 */
  readonly carriage: { readonly from: number; readonly to: number; readonly thud: number };
}

export interface Typewriter {
  readonly id: TypeId;
  readonly label: string;
  /** UI 의 점. 그림은 요란해도 화면 장식은 조용하다 — §3 의 절제를 지킨다. */
  readonly tint: string;
  /** 키가 눌릴 때의 빛 */
  readonly glow: string;
  readonly src: string;
  /** 숫자열 · QWERTY · ASDF · ZXCV */
  readonly rows: readonly [KeyRow, KeyRow, KeyRow, KeyRow];
  readonly voice: Voice;
}

export const TYPEWRITERS = [
  {
    id: 'steel', label: '강철',
    tint: '#8ba3ae', glow: 'rgba(255, 255, 255, .95)', src: steel,
    rows: [
      { y: 56.3, x0: 23.0, gap: 4.84 },
      { y: 64.3, x0: 24.8, gap: 4.90 },
      { y: 71.5, x0: 26.0, gap: 4.90 },
      { y: 78.5, x0: 28.2, gap: 4.90 },
    ],
    // 금속. 활자가 때린 뒤 짧은 잔향이 남는다 — 벨과 같은 두 배음, 아주 조용히.
    voice: {
      key: {
        kind: 'strike',
        decay: 180, hp: [1200, 2000], hammer: [120, 160], hammerTo: 60, hammerGain: .08,
        ring: [2200, 3300],
      },
      bell: [2200, 3300],
      carriage: { from: 800, to: 300, thud: 80 },
    },
  },
  {
    id: 'oak', label: '참나무',
    tint: '#b4936e', glow: 'rgba(255, 220, 165, .95)', src: oak,
    rows: [
      { y: 57.3, x0: 21.7, gap: 5.32 },
      { y: 64.5, x0: 23.3, gap: 5.30 },
      { y: 71.5, x0: 24.5, gap: 5.31 },
      { y: 78.5, x0: 26.5, gap: 5.33 },
    ],
    // 나무는 낮고 둔탁하다. 해머 뒤에 55Hz 몸통 저음이 짧게 얹힌다 — 손끝에 닿는 무게.
    voice: {
      key: {
        kind: 'strike',
        decay: 120, hp: [380, 700], hammer: [88, 110], hammerTo: 42, hammerGain: .15,
        thump: 55,
      },
      bell: [1500, 2250],
      carriage: { from: 600, to: 220, thud: 62 },
    },
  },
  {
    id: 'sugar', label: '설탕',
    tint: '#c9808f', glow: 'rgba(255, 225, 235, .98)', src: sugar,
    rows: [
      { y: 54.0, x0: 21.5, gap: 5.80 },
      { y: 63.0, x0: 23.0, gap: 6.02 },
      { y: 70.5, x0: 24.2, gap: 6.10 },
      { y: 78.0, x0: 26.5, gap: 6.20 },
    ],
    // 푸딩. 활자를 때리지 않는다 — 물방울이 톡 하고 터지는 소리.
    // sine 이 살짝 미끄러지며 떨어지고, 그 위에 짧은 반짝(tinkle) 하나.
    voice: {
      key: {
        kind: 'bubble',
        pluck: [460, 720],
        pluckTo: 220,
        tinkle: [3200, 4500],
      },
      bell: [2900, 4350],
      carriage: { from: 1100, to: 420, thud: 105 },
    },
  },
  {
    id: 'moss', label: '이끼',
    tint: '#8fae94', glow: 'rgba(225, 255, 220, .95)', src: moss,
    rows: [
      { y: 57.0, x0: 22.7, gap: 5.07 },
      { y: 63.8, x0: 24.5, gap: 5.22 },
      { y: 70.5, x0: 25.7, gap: 5.26 },
      { y: 77.5, x0: 28.0, gap: 5.25 },
    ],
    // 숲속 물방울 (사용자 지정: 타자기 소리가 아니라 듣기 좋은 ASMR 로).
    // 420Hz 근방에서 잠깐 가라앉았다가 700Hz 로 미끄러지는 '블뤼입' —
    // 이끼 낀 샘에 물이 똑 떨어지는 소리.
    voice: {
      key: {
        kind: 'droplet',
        start: [360, 480],
        dip: 250,
        rise: 700,
        moist: 0.035,
      },
      bell: [1900, 2850],
      carriage: { from: 700, to: 260, thud: 70 },
    },
  },
] as const satisfies readonly Typewriter[];

const byId = new Map<string, Typewriter>(TYPEWRITERS.map((t) => [t.id, t]));

export const DEFAULT_TYPEWRITER = TYPEWRITERS[0];

export const isTypeId = (v: unknown): v is TypeId => typeof v === 'string' && byId.has(v);

/** DB 는 문자열을 돌려준다. 모르는 값이 와도 화면이 깨지지 않게 기본값으로 떨어뜨린다. */
export const getTypewriter = (id: string | null | undefined): Typewriter =>
  (id && byId.get(id)) || DEFAULT_TYPEWRITER;

/** 새 전보함에 아직 안 쓰인 타자기를 준다. 다 찼으면 순환한다. */
export const pickType = (used: readonly string[] = []): TypeId =>
  (TYPEWRITERS.find((t) => !used.includes(t.id)) ?? TYPEWRITERS[used.length % TYPEWRITERS.length]!).id;
