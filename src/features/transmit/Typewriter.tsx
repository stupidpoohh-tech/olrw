import { useRef } from 'react';
import type { Typewriter as Machine } from '../../design/typewriters';
import type { KeyPos } from './keys';

interface Props {
  machine: Machine;
  /** 지금 눌린 자리. id 가 바뀔 때마다 다시 반짝인다. */
  pressed: { pos: KeyPos; id: number } | null;
  bell: boolean;
  /** 좌우로 넘겨 타자기를 바꾼다. 없으면 넘기기 UI 를 숨긴다. */
  onStep?: ((dir: -1 | 1) => void) | undefined;
}

/** 이보다 많이 끌어야 넘긴 것으로 친다. 세로 스크롤과 헷갈리지 않을 만큼. */
const SWIPE_PX = 42;

export function Typewriter({ machine, pressed, bell, onStep }: Props) {
  const from = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  const start = (x: number, y: number) => { from.current = { x, y }; swiped.current = false; };
  const move = (x: number, y: number) => {
    if (!from.current || swiped.current || !onStep) return;
    const dx = x - from.current.x;
    const dy = y - from.current.y;
    // 세로로 더 많이 움직였으면 스크롤 의도다. 건드리지 않는다.
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
    swiped.current = true;
    onStep(dx < 0 ? 1 : -1);   // 왼쪽으로 밀면 다음 대
  };
  const end = () => { from.current = null; };

  return (
    /**
     * 줄 전체가 스와이프 판이고, 셰브런은 이 줄의 양 끝에 앉는다.
     * 예전에는 셰브런을 .tw 바깥(left: -46px)에 두었는데, 그 46px 이 문서
     * 가로 넘침으로 잡혀 iOS 사파리가 화면 전체를 축소(shrink-to-fit)했다.
     * 넘치는 것을 만들지 않는 것이 유일하게 확실한 해법이다.
     */
    <div
      className="tw-row"
      onTouchStart={(e) => { const t = e.touches[0]; if (t) start(t.clientX, t.clientY); }}
      onTouchMove={(e) => { const t = e.touches[0]; if (t) move(t.clientX, t.clientY); }}
      onTouchEnd={end}
      onPointerDown={(e) => { if (e.pointerType === 'mouse') start(e.clientX, e.clientY); }}
      onPointerMove={(e) => { if (e.pointerType === 'mouse' && from.current) move(e.clientX, e.clientY); }}
      onPointerUp={end}
      onPointerLeave={end}
    >
      {onStep && (
        <button type="button" className="tw-step prev" aria-label="이전 타자기" onClick={() => onStep(-1)}>
          <svg viewBox="0 0 10 16" aria-hidden="true"><path d="M9 1 1 8l8 7z" fill="currentColor" /></svg>
        </button>
      )}

      <div className="tw">
        <img className="tw-img" src={machine.src} alt={`${machine.label} 타자기`} draggable={false} />
        {pressed && (
          <span
            key={pressed.id}
            className="tw-key"
            aria-hidden="true"
            style={{
              left: `${pressed.pos.x}%`,
              top: `${pressed.pos.y}%`,
              width: `${pressed.pos.size}%`,
              paddingBottom: `${pressed.pos.size}%`,
              // 빛도 타자기마다 다르다 — 강철은 흰빛, 참나무는 호박빛
              background: `radial-gradient(circle, ${machine.glow}, transparent 68%)`,
            }}
          />
        )}
        <div className={`tw-bell ${bell ? 'ring' : ''}`} aria-hidden="true" />
      </div>

      {onStep && (
        <button type="button" className="tw-step next" aria-label="다음 타자기" onClick={() => onStep(1)}>
          <svg viewBox="0 0 10 16" aria-hidden="true"><path d="M1 1 9 8l-8 7z" fill="currentColor" /></svg>
        </button>
      )}
    </div>
  );
}
