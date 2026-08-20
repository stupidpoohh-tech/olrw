// ============================================
// ArchiveView — bookshelf + opened book
// ============================================

function BookSpine({ vol, onClick, idx }) {
  const isImg = typeof vol.cover === 'string' &&
    (vol.cover.startsWith('data:') || vol.cover.startsWith('http') || vol.cover.startsWith('blob:'));
  const spineStyle = isImg
    ? { background: `center / cover no-repeat url("${vol.cover}")` }
    : undefined;
  return (
    <button
      className={`book ${isImg ? 'cover-photo' : `cover-${vol.cover || 'sage'}`}`}
      data-h={idx % 5}
      onClick={onClick}
      aria-label={`${vol.label} 열기`}
    >
      <div className="book-spine" style={spineStyle}>
        <div className="book-spine-vol">{vol.label}</div>
        <div className="book-spine-label">{vol.title || ''}</div>
        <div className="book-spine-vol" style={{ fontSize: 9, opacity: 0.7 }}>
          {vol.count}
        </div>
      </div>
    </button>
  );
}

function Shelf({ volumes, onOpen }) {
  // Group books into shelves of 8
  const shelves = [];
  for (let i = 0; i < volumes.length; i += 8) {
    shelves.push(volumes.slice(i, i + 8));
  }
  if (shelves.length === 0) shelves.push([]);

  return (
    <div className="shelf-wrap">
      {shelves.map((books, si) => (
        <div className="shelf" key={si}>
          <div className="shelf-books">
            {books.length === 0 ? (
              <div className="shelf-empty">— 아직 보관된 권이 없습니다 —</div>
            ) : (
              books.map((vol, i) => (
                <BookSpine
                  key={vol.id || vol.vol}
                  vol={vol}
                  idx={i + si * 8}
                  onClick={() => onOpen(vol)}
                />
              ))
            )}
          </div>
          <div className="shelf-board" />
        </div>
      ))}
    </div>
  );
}

function BookOpen({ vol, onClose, onDelete, me, names }) {
  const { useEffect } = React;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDelete = () => {
    if (window.confirm(`${vol.label}을(를) 서가에서 제거합니다. 이 과정은 되돌릴 수 없습니다.\n진행할까요?`)) {
      onDelete(vol.id);
      onClose();
    }
  };

  return (
    <div className="book-stage">
      <div className="book-stage-top">
        <button onClick={onClose}>← 서가</button>
        <span>{vol.label}</span>
        <button className="danger" onClick={handleDelete}>제거</button>
      </div>
      <div className="book-open">
        <div className="book-inner">
          <div className="book-title-page">
            <div className="book-title-vol">{vol.label}</div>
            {vol.title && vol.title !== vol.label && (
              <div className="book-title-name">{vol.title}</div>
            )}
            <div className="book-title-period">{vol.period}</div>
            <div className="book-title-count">{vol.count} TELEGRAMS</div>
          </div>

          {(vol.telegrams || []).map((t, i) => {
            const isMine = t.from === me;
            const fromName = t.name || (names && names[t.from]) || (isMine ? '나' : '친구');
            const p = window.getPaper(t.paper);
            return (
              <div className="book-page-tg" key={i} style={{ background: p.bg, borderColor: p.edge, color: p.ink }}>
                <div className="book-page-from" style={{ color: p.ink }}>
                  <span className="book-page-swatch" style={{ background: p.edge }} /> {fromName}
                </div>
                <div className="book-page-text">
                  <FormattedText text={t.text} />
                </div>
                <div className="book-page-time">{t.time}</div>
              </div>
            );
          })}

          <div className="book-end-stamp">
            <div className="book-end-stamp-inner">— fin —</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchiveView({ state, store }) {
  const { useState } = React;
  const [openVol, setOpenVol] = useState(null);

  return (
    <div className="fade-up">
      <div className="section-label">서가 · ARCHIVE</div>
      <Shelf volumes={state.volumes} onOpen={setOpenVol} />
      {state.volumes.length === 0 && (
        <div className="empty" style={{ marginTop: 8 }}>
          첫 만남 후 이곳에 첫 권이 보관됩니다.
        </div>
      )}
      {openVol && (
        <BookOpen
          vol={openVol}
          me={state.me}
          names={state.names}
          onClose={() => setOpenVol(null)}
          onDelete={store.deleteVolume}
        />
      )}
    </div>
  );
}

window.ArchiveView = ArchiveView;
