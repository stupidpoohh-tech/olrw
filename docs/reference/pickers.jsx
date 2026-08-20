// ============================================
// Shared pickers — color swatches for paper & typewriter
// ============================================

function ColorChoices({ kind, value, onChange }) {
  const list = kind === 'type' ? window.TYPE_COLORS : window.PAPER_COLORS;
  return (
    <div className="swatch-row">
      {list.map((c) => {
        const bg = kind === 'type' ? c.tint : c.bg;
        const sel = value === c.id;
        return (
          <button
            type="button"
            key={c.id}
            className={`swatch ${kind} ${sel ? 'active' : ''}`}
            style={{ background: bg, borderColor: kind === 'type' ? c.tint : c.edge }}
            onClick={() => onChange(c.id)}
            title={c.label}
            aria-label={c.label}
          >
            {sel && <span className="swatch-check">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

// Preview of the typewriter tint for a chosen type color
function TypePreview({ typeId }) {
  const t = window.getType(typeId);
  return (
    <div className="type-preview">
      <img src="assets/typewriter.png" alt="" style={{ filter: t.filter }} />
    </div>
  );
}

window.ColorChoices = ColorChoices;
window.TypePreview = TypePreview;
