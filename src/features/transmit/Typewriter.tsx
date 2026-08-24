import type { Typewriter as Machine } from '../../design/typewriters';
import type { KeyPos } from './keys';

interface Props {
  machine: Machine;
  /** 지금 눌린 자리. id 가 바뀔 때마다 다시 반짝인다. */
  pressed: { pos: KeyPos; id: number } | null;
  bell: boolean;
}

export function Typewriter({ machine, pressed, bell }: Props) {
  return (
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
  );
}
