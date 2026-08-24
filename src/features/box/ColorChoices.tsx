import { PAPER_COLORS, type PaperId } from '../../design/colors';
import { paperSwatchStyle } from '../../design/paper';
import { TYPEWRITERS, getTypewriter, type TypeId } from '../../design/typewriters';
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
  const chosen = getTypewriter(value);
  return (
    <>
      <div className="machines" role="radiogroup" aria-label="타자기">
        {TYPEWRITERS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={value === t.id}
            className={`machine ${value === t.id ? 'active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            <img src={t.src} alt="" draggable={false} />
            <span className="machine-name">
              <span className="machine-dot" style={{ background: t.tint }} />
              {t.label}
            </span>
          </button>
        ))}
      </div>
      <p className="machine-note">
        고른 타자기에 따라 타건음과 벨소리가 달라집니다. 지금은 <b>{chosen.label}</b>입니다.
      </p>
    </>
  );
}
