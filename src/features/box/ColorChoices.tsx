import { PAPER_COLORS, TYPE_COLORS, type PaperId, type TypeId } from '../../design/colors';
import { paperSwatchStyle } from '../../design/paper';
import { typewriterArt } from '../../design/typewriter';
import './ColorChoices.css';

interface PaperProps {
  value: PaperId;
  onChange: (id: PaperId) => void;
  /** 이미 다른 참여자가 쓰고 있는 색. 고를 수 없다 — 색이 겹치면 발신인을 못 읽는다. */
  taken?: readonly PaperId[];
}

export function PaperChoices({ value, onChange, taken = [] }: PaperProps) {
  return (
    <div className="swatches" role="radiogroup" aria-label="용지색">
      {PAPER_COLORS.map((p) => {
        const isTaken = taken.includes(p.id) && p.id !== value;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            aria-label={isTaken ? `${p.label} (사용 중)` : p.label}
            title={isTaken ? `${p.label} — 다른 참여자가 쓰고 있어요` : p.label}
            disabled={isTaken}
            className={`swatch paper ${value === p.id ? 'active' : ''} ${isTaken ? 'taken' : ''}`}
            style={paperSwatchStyle(p.id)}
            onClick={() => onChange(p.id)}
          >
            {value === p.id && <span className="swatch-check" style={{ color: p.ink }}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TypeChoices({ value, onChange }: { value: TypeId; onChange: (id: TypeId) => void }) {
  const art = typewriterArt(value);
  return (
    <>
      <div className="swatches" role="radiogroup" aria-label="타자기색">
        {TYPE_COLORS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            aria-label={t.label}
            title={t.label}
            className={`swatch type ${value === t.id ? 'active' : ''}`}
            style={{ background: t.tint, borderColor: t.tint }}
            onClick={() => onChange(t.id)}
          >
            {value === t.id && <span className="swatch-check light">✓</span>}
          </button>
        ))}
      </div>
      <div className="type-preview">
        <img src={art.src} alt="" style={art.filter ? { filter: art.filter } : undefined} />
      </div>
    </>
  );
}
