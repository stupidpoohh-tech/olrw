// ============================================
// App — root (auth → onboarding → multi-box app)
// ============================================

const { useState, useEffect, useRef } = React;

function useStore() {
  const [state, setState] = useState(window.tajeonStore.getState());
  useEffect(() => window.tajeonStore.subscribe(setState), []);
  return [state, window.tajeonStore];
}

function Header({ onSignOut }) {
  return (
    <header className="header">
      <h1 className="brand-title">Our love, rightly written</h1>
      {onSignOut && (
        <button className="header-signout" onClick={onSignOut} title="로그아웃">로그아웃</button>
      )}
    </header>
  );
}

function Nav({ view, setView }) {
  const tabs = [['transmit', '타전실'], ['inbox', '수신함'], ['archive', '서가']];
  return (
    <nav className="nav">
      {tabs.map(([key, label]) => (
        <button key={key} className={`nav-btn ${view === key ? 'active' : ''}`} onClick={() => setView(key)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

// ── Box switcher + info bar ────────────────────────────────────────
function BoxBar({ state, store, onAddBox, onSettings }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!state.room) return null;
  const room = state.room;
  const myType = window.getType(state.myType);

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };
  const switchTo = (roomId) => { store.setActiveBox(roomId); setOpen(false); };
  const leave = () => {
    if (window.confirm(`'${room.name}' 전보함에서 나갈까요?\n(다시 들어오려면 코드가 필요해요)`)) {
      store.leaveBox(room.roomId); setOpen(false);
    }
  };
  const startRename = () => { setDraftName(room.name || ''); setRenaming(true); };
  const commitRename = () => { const t = draftName.trim(); if (t && t !== room.name) store.renameBox(t); setRenaming(false); };

  return (
    <div className="box-bar" ref={ref}>
      <div className="box-bar-main">
        <button className="box-switch" onClick={() => setOpen((o) => !o)}>
          <span className="box-dot" style={{ background: myType.tint }} />
          {renaming ? (
            <input className="box-name-input" autoFocus value={draftName}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(false); }}
              maxLength={20} />
          ) : (
            <span className="box-name">{room.name || '이름 없는 전보함'}</span>
          )}
          <span className={`box-chevron ${open ? 'up' : ''}`}>▾</span>
        </button>
        <button className={`box-code ${copied ? 'copied' : ''}`} onClick={copyCode} title="초대 코드 복사">
          <span className="box-code-val">{room.code}</span>
          <span className="box-code-ico">{copied ? '✓' : '⧉'}</span>
        </button>
      </div>

      <div className="box-members">
        {room.memberList.map((m) => {
          const p = window.getPaper(m.paper);
          const isMe = m.uid === state.me;
          return (
            <span key={m.uid} className={`box-member ${isMe ? 'me' : ''}`} title={m.name}>
              <span className="box-member-swatch" style={{ background: p.bg, borderColor: p.edge }} />
              {m.name}{m.uid === room.ownerUid ? ' ·방장' : ''}{isMe ? ' (나)' : ''}
            </span>
          );
        })}
      </div>

      {open && (
        <div className="box-menu">
          <div className="box-menu-label">내 전보함</div>
          {state.boxes.map((b) => {
            const t = window.getType(b.myType);
            const active = b.roomId === room.roomId;
            return (
              <button key={b.roomId} className={`box-menu-item ${active ? 'active' : ''}`} onClick={() => switchTo(b.roomId)}>
                <span className="box-dot" style={{ background: t.tint }} />
                <span className="box-menu-name">{b.name}</span>
                <span className="box-menu-meta">{b.memberCount}명 · VOL.{b.currentVol}</span>
              </button>
            );
          })}
          <div className="box-menu-divider" />
          <button className="box-menu-action" onClick={() => { setOpen(false); onAddBox(); }}>＋ 새 전보함 만들기 / 참여</button>
          <button className="box-menu-action" onClick={() => { setOpen(false); onSettings(); }}>🎨 내 색 · 이름 설정</button>
          <button className="box-menu-action" onClick={() => { setOpen(false); startRename(); }}>✎ 전보함 이름 변경</button>
          <button className="box-menu-action danger" onClick={leave}>↩ 이 전보함 나가기</button>
        </div>
      )}
    </div>
  );
}

// ── Color / name settings modal ────────────────────────────────────
function SettingsModal({ state, store, onClose }) {
  const [paper, setPaper] = useState(state.myPaper);
  const [type, setType]   = useState(state.myType);
  const [name, setName]   = useState(state.user.displayName);

  const save = () => {
    if (name.trim() && name.trim() !== state.user.displayName) store.updateDisplayName(name.trim());
    store.setMyColors({ paper, type });
    onClose();
  };

  return (
    <div className="modal-stage" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">내 색 · 이름</div>
        <div className="modal-sub">'{state.room.name}' 전보함에서 쓰는 설정이에요.</div>

        <div className="onb-field">
          <div className="onb-field-label">내 이름 <span className="onb-field-tag">모든 전보함 공통</span></div>
          <input className="onb-input" type="text" value={name} maxLength={12}
            onChange={(e) => setName(e.target.value)} placeholder="표시 이름" />
        </div>
        <div className="onb-field">
          <div className="onb-field-label">내 전보 용지 색</div>
          <div className="onb-field-hint">내가 보내는 전보의 색이에요.</div>
          <window.ColorChoices kind="paper" value={paper} onChange={setPaper} />
        </div>
        <div className="onb-field">
          <div className="onb-field-label">내 타자기 색</div>
          <div className="onb-field-hint">홈 화면에서 이 전보함을 구분하는 색이에요. (나만 봅니다)</div>
          <window.ColorChoices kind="type" value={type} onChange={setType} />
          <window.TypePreview typeId={type} />
        </div>

        <div className="modal-btns">
          <button className="ritual-btn ghost" onClick={onClose}>취소</button>
          <button className="ritual-btn primary" onClick={save}>저장</button>
        </div>
      </div>
    </div>
  );
}

function AddBoxModal({ store, onClose }) {
  return (
    <div className="modal-stage" onClick={onClose}>
      <div className="modal-card wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">새 전보함</div>
        <BoxOnboard store={store} canCancel onCancel={onClose} onDone={onClose} />
      </div>
    </div>
  );
}

// ── Telegram card (colored by sender's paper) ──────────────────────
function TelegramCard({ telegram, mine, onDelete, names, papers }) {
  const t = telegram;
  const fromName = names?.[t.from] || '?';
  const p = window.getPaper(papers?.[t.from]);
  const style = { background: p.bg, borderColor: p.edge, color: p.ink };

  return (
    <div className={`card ${mine ? 'from-me' : 'from-other'}`} style={style}>
      <button className="card-delete" title="삭제"
        onClick={(e) => { e.stopPropagation(); if (window.confirm('이 전보를 삭제하시겠어요?')) onDelete(t.id); }}>×</button>
      <div className="card-meta">
        <b><span className="dot" style={{ background: p.edge }} />{mine ? '송신' : '수신'} · {fromName}</b>
        <span>No.{(t.id || '').toString().slice(-4).toUpperCase()}</span>
      </div>
      <div className="card-text"><FormattedText text={t.text} /></div>
      <div className="card-time">
        {new Date(t.time).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

function InboxView({ state, store }) {
  const received = state.telegrams.filter((t) => t.from !== state.me && t.vol === state.currentVol);
  return (
    <div className="fade-up">
      <div className="notice">받은 전보 · 이번 권</div>
      {received.length === 0 ? (
        <div className="empty">아직 도착한 전보가 없습니다.</div>
      ) : (
        received.map((t) => (
          <TelegramCard key={t.id} telegram={t} mine={false} names={state.names} papers={state.papers} onDelete={store.deleteTelegram} />
        ))
      )}
    </div>
  );
}

function App() {
  const [state, store] = useStore();
  const [view, setView] = useState('transmit');
  const [ritualOpen, setRitualOpen] = useState(false);
  const [addBox, setAddBox] = useState(false);
  const [settings, setSettings] = useState(false);

  if (state._loading) return <div className="boot-splash"><div className="boot-mark">OLRW</div></div>;
  if (!state.user) return <AuthScreen store={store} />;
  if (!state.room) return <PairingScreen user={state.user} store={store} />;

  return (
    <div className="app">
      <Header onSignOut={store.signOut} />
      <Nav view={view} setView={setView} />
      <BoxBar state={state} store={store} onAddBox={() => setAddBox(true)} onSettings={() => setSettings(true)} />

      <main className="main">
        {view === 'transmit' && (
          <TransmitView state={state} store={store} onSend={(text) => store.sendTelegram(text)} onOpenRitual={() => setRitualOpen(true)} />
        )}
        {view === 'inbox' && <InboxView state={state} store={store} />}
        {view === 'archive' && <ArchiveView state={state} store={store} />}
      </main>

      {ritualOpen && (
        <MeetingRitual state={state} onClose={() => setRitualOpen(false)}
          onConfirmClose={({ title, cover }) => store.closeVol({ title, cover })}
          onCloseAndGoArchive={() => { setRitualOpen(false); setView('archive'); }} />
      )}
      {addBox && <AddBoxModal store={store} onClose={() => setAddBox(false)} />}
      {settings && <SettingsModal state={state} store={store} onClose={() => setSettings(false)} />}
    </div>
  );
}

window.TelegramCard = TelegramCard;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
