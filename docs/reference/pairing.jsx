// ============================================
// BoxOnboard — create or join a shared 전보함
//   Reused full-screen (PairingScreen, when user has no boxes)
//   and inside a modal (app "새 전보함" button).
// ============================================

function BoxOnboard({ store, onDone, onCancel, canCancel }) {
  const { useState } = React;
  const [tab, setTab]   = useState('create');   // 'create' | 'join'
  const [name, setName] = useState('');
  const [input, setInput] = useState('');       // join code
  const [paper, setPaper] = useState(window.PAPER_COLORS[0].id);
  const [type, setType]   = useState(window.TYPE_COLORS[0].id);
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);
  const [code, setCode]   = useState(null);      // created code
  const [copied, setCopied] = useState(false);

  const onCreate = async () => {
    setError(''); setBusy(true);
    try {
      const c = await store.createBox({ name, paper, type });
      setCode(c);
    } catch (err) { setError(err.message || '전보함을 만들지 못했어요.'); }
    finally { setBusy(false); }
  };

  const onJoin = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await store.joinBox({ code: input, paper, type });
      onDone && onDone();
    } catch (err) { setError(err.message || '전보함에 들어가지 못했어요.'); }
    finally { setBusy(false); }
  };

  const onCodeInput = (raw) => {
    const x = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    setInput(x.length <= 4 ? x : x.slice(0, 4) + '-' + x.slice(4));
  };

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch {}
  };

  const ColorBlock = (
    <>
      <div className="onb-field">
        <div className="onb-field-label">내 전보 용지 색</div>
        <div className="onb-field-hint">이 전보함에서 내가 보내는 전보의 색이에요.</div>
        <window.ColorChoices kind="paper" value={paper} onChange={setPaper} />
      </div>
      <div className="onb-field">
        <div className="onb-field-label">내 타자기 색</div>
        <div className="onb-field-hint">홈 화면에서 전보함을 구분하는 색이에요. (나만 봅니다)</div>
        <window.ColorChoices kind="type" value={type} onChange={setType} />
        <window.TypePreview typeId={type} />
      </div>
    </>
  );

  return (
    <div className="onb-card">
      <div className="onb-tabs">
        <button type="button" className={`onb-tab ${tab === 'create' ? 'active' : ''}`}
          onClick={() => { setTab('create'); setError(''); }}>전보함 만들기</button>
        <button type="button" className={`onb-tab ${tab === 'join' ? 'active' : ''}`}
          onClick={() => { setTab('join'); setError(''); setCode(null); }}>코드로 참여</button>
      </div>

      {tab === 'create' && (
        code ? (
          <div className="onb-panel onb-created">
            <div className="onb-code-label">전보함이 열렸어요 · 초대 코드</div>
            <div className="onb-code">{code}</div>
            <button className={`onb-copy ${copied ? 'copied' : ''}`} onClick={onCopy}>
              {copied ? '복사됨 ✓' : '코드 복사'}
            </button>
            <p className="onb-note">이 코드를 함께할 사람들에게 보내주세요.<br />최대 4명까지 같은 전보함을 씁니다.</p>
            <button className="onb-primary" onClick={() => onDone && onDone()}>전보함 열기 →</button>
          </div>
        ) : (
          <div className="onb-panel">
            <div className="onb-field">
              <div className="onb-field-label">전보함 이름</div>
              <input className="onb-input" type="text" value={name} maxLength={20}
                onChange={(e) => setName(e.target.value)} placeholder="예) 퇴근길 전보함, 우리 셋" />
            </div>
            {ColorBlock}
            {error && <div className="onb-error">{error}</div>}
            <button className="onb-primary" onClick={onCreate} disabled={busy || !name.trim()}>
              {busy ? '만드는 중…' : '전보함 만들기'}
            </button>
          </div>
        )
      )}

      {tab === 'join' && (
        <form className="onb-panel" onSubmit={onJoin}>
          <div className="onb-field">
            <div className="onb-field-label">초대 코드</div>
            <input className="onb-input onb-code-input" type="text" value={input}
              onChange={(e) => onCodeInput(e.target.value)} placeholder="ABCD-2345"
              maxLength={9} autoCapitalize="characters" spellCheck={false} />
          </div>
          {ColorBlock}
          {error && <div className="onb-error">{error}</div>}
          <button type="submit" className="onb-primary" disabled={busy || input.length < 9}>
            {busy ? '들어가는 중…' : '전보함 참여하기'}
          </button>
        </form>
      )}

      {canCancel && (
        <button type="button" className="onb-cancel" onClick={onCancel}>닫기</button>
      )}
    </div>
  );
}

function PairingScreen({ user, store }) {
  return (
    <div className="pair-wrap">
      <div className="pair-head-bar">
        <div className="pair-greeting">
          <span className="pair-greet-tag">SIGNED&nbsp;IN</span>
          <span className="pair-greet-name">{user.displayName}</span>
        </div>
        <button className="pair-signout" onClick={store.signOut}>로그아웃</button>
      </div>
      <h2 className="pair-title">첫 전보함을 열어요</h2>
      <p className="pair-sub">
        전보함을 <b>만들어</b> 코드를 나눠주거나, 받은 <b>코드로 참여</b>하세요.<br />
        여러 명이 같은 전보함에서 전보를 주고받을 수 있어요.
      </p>
      <BoxOnboard store={store} onDone={() => { /* state.room appears → routes away */ }} />
    </div>
  );
}

window.BoxOnboard = BoxOnboard;
window.PairingScreen = PairingScreen;
