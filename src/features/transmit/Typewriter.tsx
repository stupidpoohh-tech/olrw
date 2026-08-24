import { typewriterArt } from '../../design/typewriter';
import type { TypeId } from '../../design/colors';
import { KEY_SIZE, type KeyPos } from './keys';

interface Props {
  typeColor: TypeId;
  /** 지금 눌린 자리. id 가 바뀔 때마다 다시 반짝인다. */
  pressed: { pos: KeyPos; id: number } | null;
  bell: boolean;
}

export function Typewriter({ typeColor, pressed, bell }: Props) {
  const art = typewriterArt(typeColor);
  return (
    <div className="tw">
      <img
        className="tw-img"
        src={art.src}
        alt="타자기"
        style={art.filter ? { filter: art.filter } : undefined}
        draggable={false}
      />
      {pressed && (
        <span
          key={pressed.id}
          className="tw-key"
          aria-hidden="true"
          style={{
            left: `${pressed.pos.x}%`,
            top: `${pressed.pos.y}%`,
            width: `${KEY_SIZE}%`,
            paddingBottom: `${KEY_SIZE}%`,
          }}
        />
      )}
      <div className={`tw-bell ${bell ? 'ring' : ''}`} aria-hidden="true" />
    </div>
  );
}
