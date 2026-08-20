// ============================================
// TransmitView — typewriter + paper + sending
// Refined white edition
// ============================================

const CHAR_LIMIT = 100;
const BELL_AT = 85;

// QWERTY → row/col map. Numbers + Korean + anything else → random key.
const KEYMAP = {
  // row 0 (numbers)
  '1':[0,0],'2':[0,1],'3':[0,2],'4':[0,3],'5':[0,4],'6':[0,5],'7':[0,6],'8':[0,7],'9':[0,8],'0':[0,9],
  // row 1 (qwerty)
  'q':[1,0],'w':[1,1],'e':[1,2],'r':[1,3],'t':[1,4],'y':[1,5],'u':[1,6],'i':[1,7],'o':[1,8],'p':[1,9],
  // row 2 (asdf)
  'a':[2,0],'s':[2,1],'d':[2,2],'f':[2,3],'g':[2,4],'h':[2,5],'j':[2,6],'k':[2,7],'l':[2,8],
  // row 3 (zxcv)
  'z':[3,0],'x':[3,1],'c':[3,2],'v':[3,3],'b':[3,4],'n':[3,5],'m':[3,6],
};

const ROW_LENS = [10, 10, 9, 9];

function keyFor(char) {
  if (!char) return null;
  const lc = char.toLowerCase();
  if (KEYMAP[lc]) return KEYMAP[lc];
  // for Korean / punctuation / etc. — pick a random position so it still feels alive
  const r = Math.floor(Math.random() * 4);
  const c = Math.floor(Math.random() * ROW_LENS[r]);
  return [r, c];
}

// Render text with STOP tags styled differently
function FormattedText({ text, charClass }) {
  if (!text) return null;
  const parts = text.split(/(\bSTOP\b)/g);
  let charIdx = 0;
  return (
    <>
      {parts.map((part, i) => {
        if (part === 'STOP') {
          return <span key={i} className="stop-tag">STOP</span>;
        }
        return [...part].map((c, j) => {
          charIdx++;
          return (
            <span key={`${i}-${j}`} className={charClass || ''}>
              {c}
            </span>
          );
        });
      })}
    </>
  );
}

function KeysOverlay({ pressed }) {
  // pressed = { row, col, id } | null
  return (
    <div className="keys-overlay">
      {ROW_LENS.map((cols, r) => (
        <div className={`key-row r${r + 1}`} key={r}>
          {Array.from({ length: cols }).map((_, c) => {
            const isOn = pressed && pressed.row === r && pressed.col === c;
            return (
              <span
                key={`${pressed?.id || 0}-${r}-${c}`}
                className={`key-hot ${isOn ? 'is-pressed' : ''}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TypewriterImage({ pressed, bellRinging, filter }) {
  return (
    <div className="typewriter-img-wrap">
      <img
        src="assets/typewriter.png"
        alt="Olivetti Lettera 32"
        className="typewriter-img"
        style={{ filter: filter || 'none' }}
      />
      <KeysOverlay pressed={pressed} />
      <div className={`bell-glint ${bellRinging ? 'is-ringing' : ''}`} />
    </div>
  );
}

function Paper({ text, setText, onSend, sending, justSent, typeFilter, paper }) {
  const { useRef, useState, useEffect } = React;
  const inputRef = useRef(null);
  const [pressed, setPressed] = useState(null);
  const [bellRinging, setBellRinging] = useState(false);
  const [lastLen, setLastLen] = useState(text.length);
  const { playKey, playBell } = useTypeSound();
  const pressTimer = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    if (val.length > CHAR_LIMIT) return;

    if (val.length > lastLen) {
      playKey();
      const newChar = val[val.length - 1];
      const pos = keyFor(newChar);
      if (pos) {
        setPressed({ row: pos[0], col: pos[1], id: Date.now() + Math.random() });
        if (pressTimer.current) clearTimeout(pressTimer.current);
        pressTimer.current = setTimeout(() => setPressed(null), 130);
      }

      if (lastLen < BELL_AT && val.length >= BELL_AT) {
        playBell();
        setBellRinging(true);
        setTimeout(() => setBellRinging(false), 700);
      }
    }
    setLastLen(val.length);
    setText(val);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleStageClick = () => inputRef.current?.focus();

  const charRatio = text.length / CHAR_LIMIT;
  const charClass = charRatio >= 1 ? 'danger' : charRatio >= 0.85 ? 'warn' : '';
  const serial = String(450 + (text.length % 999)).padStart(4, '0');

  const paperStyle = paper ? { background: paper.bg, borderColor: paper.edge, color: paper.ink } : undefined;

  return (
    <div className="typewriter-stage">
      <TypewriterImage pressed={pressed} bellRinging={bellRinging} filter={typeFilter} />

      <div className="paper-stage">
        <div className="paper" onClick={handleStageClick} style={paperStyle}>
          <div className="paper-header">
            <div className="paper-header-l">No.{serial}</div>
            <div className="paper-header-title">Telegram</div>
            <div className="paper-header-r">Priority</div>
          </div>

          <div className="typing-area">
            <textarea
              ref={inputRef}
              className="hidden-input"
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              disabled={sending}
              maxLength={CHAR_LIMIT}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
            <div className="typed-display">
              {text.length === 0 && !sending && (
                <span className="placeholder">전할 말을 짧게…</span>
              )}
              <FormattedText text={text} charClass="ink-char" />
              {!sending && <span className="cursor-bar" />}
            </div>
          </div>

          <div className="paper-footer">
            <div className="char-bar">
              <div
                className={`char-bar-fill ${charClass}`}
                style={{ width: `${charRatio * 100}%` }}
              />
            </div>
            <div className="char-row">
              <span className={`char-count ${charClass}`}>
                {text.length} / {CHAR_LIMIT}
              </span>
              <button
                className="send-btn"
                onClick={onSend}
                disabled={!text.trim() || sending}
              >
                {sending ? '송신중…' : '송신'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {justSent && (
        <div className="sent-stamp">
          <div className="sent-stamp-inner">SENT</div>
        </div>
      )}
    </div>
  );
}

function TransmitView({ state, store, onSend, onOpenRitual }) {
  const { useState } = React;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const { playReturn } = useTypeSound();

  const myTelegrams = state.telegrams
    .filter((t) => t.from === state.me && t.vol === state.currentVol);

  const handleSend = () => {
    if (!text.trim() || sending) return;
    setSending(true);
    playReturn();
    setTimeout(() => {
      onSend(text.trim());
      setText('');
      setSending(false);
      setJustSent(true);
      setTimeout(() => setJustSent(false), 2400);
    }, 700);
  };

  const currentCount = state.telegrams.filter((t) => t.vol === state.currentVol).length;
  const typeFilter = window.getType(state.myType).filter;
  const myPaper = window.getPaper(state.myPaper);

  return (
    <div className="fade-up">
      <Paper
        text={text}
        setText={setText}
        onSend={handleSend}
        sending={sending}
        justSent={justSent}
        typeFilter={typeFilter}
        paper={myPaper}
      />

      {myTelegrams.length > 0 && (
        <div className="section">
          <div className="section-label">최근 송신 · RECENT · {myTelegrams.length}</div>
          <div className="recent-scroll">
            {myTelegrams.map((t) => (
              <window.TelegramCard
                key={t.id}
                telegram={t}
                mine={true}
                names={state.names}
                papers={state.papers}
                onDelete={store.deleteTelegram}
              />
            ))}
          </div>
        </div>
      )}

      <button
        className="meet-btn"
        onClick={onOpenRitual}
        disabled={currentCount === 0}
      >
        <span className="meet-btn-icon">⏎</span>
        만남 마감 — 이번 권 닫기
        <span className="meet-btn-icon">⏎</span>
      </button>
    </div>
  );
}

window.TransmitView = TransmitView;
window.FormattedText = FormattedText;
