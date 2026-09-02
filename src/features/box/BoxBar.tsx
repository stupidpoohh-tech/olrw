import { useEffect, useRef, useState } from 'react';
import { getTypewriter } from '../../design/typewriters';
import { paperSwatchStyle } from '../../design/paper';
import { useStore } from '../../lib/storeContext';
import { toUserMessage } from '../../lib/errors';
import type { Box, BoxSummary } from '../../lib/types';
import './BoxBar.css';

interface Props {
  box: Box;
  boxes: readonly BoxSummary[];
  onSwitch: (boxId: string) => void;
  onAddBox: () => void;
  onSettings: () => void;
  onChanged: () => void;
}

export function BoxBar({ box, boxes, onSwitch, onAddBox, onSettings, onChanged }: Props) {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(box.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* 클립보드 권한 없음 — 코드는 화면에 보인다 */ }
  };

  const commitRename = async () => {
    const next = draft.trim();
    setRenaming(false);
    if (!next || next === box.name) return;
    try { await store.renameBox(box.id, next); onChanged(); }
    catch (e) { setError(toUserMessage(e)); }
  };

  const leave = async () => {
    setOpen(false);
    const ok = window.confirm(
      `'${box.name}' 전보함에서 나갑니다.\n다시 들어오려면 초대 코드가 필요합니다.`,
    );
    if (!ok) return;
    try { await store.leaveBox(box.id); onChanged(); }
    catch (e) { setError(toUserMessage(e)); }
  };

  const myTint = getTypewriter(box.myType).tint;

  return (
    <div className="boxbar" ref={ref}>
      <div className="boxbar-main">
        {renaming ? (
          <input className="boxbar-rename" autoFocus value={draft} maxLength={20}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }} />
        ) : (
          <button className="boxbar-switch" onClick={() => setOpen((o) => !o)}
            aria-expanded={open} aria-haspopup="menu">
            <span className="boxbar-dot" style={{ background: myTint }} />
            <span className="boxbar-name">{box.name || '이름 없는 전보함'}</span>
            <span className={`boxbar-chev ${open ? 'up' : ''}`} aria-hidden="true">▾</span>
          </button>
        )}

        <button className={`boxbar-code display ${copied ? 'copied' : ''}`}
          onClick={() => void copyCode()} title="초대 코드 복사">
          {box.inviteCode}
          <span className="boxbar-code-ico" aria-hidden="true">{copied ? '✓' : '⧉'}</span>
        </button>
      </div>

      {/* 두 번째 줄은 전부 '상태' 다 — 봉인 여부와 누가 있는지. 이름·초대 코드와
          성격이 다르므로 줄을 나누고 크기와 색을 한 단계 낮춘다. */}
      <div className="boxbar-members">
        {box.sealed && <span className="boxbar-seal" title="봉인함">봉인</span>}
        {box.members.map((m) => (
          <span className="boxbar-member" key={m.userId}>
            <span className="boxbar-swatch" style={paperSwatchStyle(m.paper)} />
            {m.displayName}
            {(m.isOwner || m.isMe) && (
              <span className="boxbar-tag">
                {[m.isOwner && '방장', m.isMe && '나'].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
        ))}
        {box.memberCount < 4 && (
          <span className="boxbar-open">남은 자리 {4 - box.memberCount}</span>
        )}
      </div>

      {error && <p className="boxbar-error" role="alert">{error}</p>}

      {open && (
        <div className="boxbar-menu" role="menu">
          <div className="boxbar-menu-label">내 전보함</div>
          {boxes.map((b) => (
            <button key={b.id} role="menuitem"
              className={`boxbar-menu-item ${b.id === box.id ? 'active' : ''}`}
              onClick={() => { setOpen(false); onSwitch(b.id); }}>
              <span className="boxbar-dot" style={{ background: getTypewriter(b.myType).tint }} />
              <span className="boxbar-menu-name">{b.name}</span>
              <span className="boxbar-menu-meta tnum">{b.memberCount}명 · VOL.{b.currentVol}</span>
            </button>
          ))}
          <div className="boxbar-menu-rule" />
          <button role="menuitem" className="boxbar-menu-action"
            onClick={() => { setOpen(false); onAddBox(); }}>새 전보함 만들기 · 참여</button>
          <button role="menuitem" className="boxbar-menu-action"
            onClick={() => { setOpen(false); onSettings(); }}>내 설정</button>
          <button role="menuitem" className="boxbar-menu-action"
            onClick={() => { setOpen(false); setDraft(box.name); setRenaming(true); }}>전보함 이름 변경</button>
          <button role="menuitem" className="boxbar-menu-action danger"
            onClick={() => void leave()}>이 전보함 나가기</button>
        </div>
      )}
    </div>
  );
}
