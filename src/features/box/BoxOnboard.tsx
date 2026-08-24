import { useState, type FormEvent } from 'react';
import { PAPER_COLORS, type PaperId } from '../../design/colors';
import { TYPEWRITERS, type TypeId } from '../../design/typewriters';
import { useStore } from '../../lib/storeContext';
import { toUserMessage } from '../../lib/errors';
import { PaperChoices, TypeChoices } from './ColorChoices';
import './BoxOnboard.css';

type Tab = 'create' | 'join';

interface Props {
  onDone: (boxId: string) => void;
  onCancel?: (() => void) | undefined;
}

/** 코드 입력을 ABCD-2345 꼴로 다듬는다. */
const formatCode = (raw: string): string => {
  const x = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return x.length <= 4 ? x : `${x.slice(0, 4)}-${x.slice(4)}`;
};

export function BoxOnboard({ onDone, onCancel }: Props) {
  const store = useStore();
  const [tab, setTab] = useState<Tab>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [paper, setPaper] = useState<PaperId>(PAPER_COLORS[0].id);
  const [type, setType] = useState<TypeId>(TYPEWRITERS[0].id);
  const [sealed, setSealed] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ boxId: string; inviteCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const switchTab = (t: Tab) => { setTab(t); setError(''); setCreated(null); };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(''); setBusy(true);
    try {
      setCreated(await store.createBox({ name, paper, type, sealed }));
    } catch (err) { setError(toUserMessage(err, '전보함을 만들지 못했습니다.')); }
    finally { setBusy(false); }
  };

  const join = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(''); setBusy(true);
    try {
      const { boxId } = await store.joinBox({ code, paper, type });
      onDone(boxId);
    } catch (err) { setError(toUserMessage(err, '전보함에 들어가지 못했습니다.')); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* 클립보드 권한 없음 — 코드는 화면에 그대로 있다 */ }
  };

  const colorFields = (
    <>
      <div className="onb-field">
        <div className="onb-field-label">내 전보 용지 색</div>
        <p className="onb-hint">이 전보함에서 내가 보내는 전보의 색입니다. 모두에게 보입니다.</p>
        <PaperChoices value={paper} onChange={setPaper} />
      </div>
      <div className="onb-field">
        <div className="onb-field-label">내 타자기</div>
        <p className="onb-hint">
          어느 전보함에 있는지 알려주는 타자기입니다. 생김새도 소리도 다릅니다. 나만 봅니다.
        </p>
        <TypeChoices value={type} onChange={setType} />
      </div>
    </>
  );

  if (created) {
    return (
      <div className="onb">
        <div className="onb-created">
          <div className="onb-code-label">전보함이 열렸습니다 · 초대 코드</div>
          <div className="onb-code display">{created.inviteCode}</div>
          <button type="button" className={`onb-copy ${copied ? 'copied' : ''}`} onClick={copy}>
            {copied ? '복사됨' : '코드 복사'}
          </button>
          <p className="onb-note">
            이 코드를 함께할 사람에게 보내주세요.<br />
            최대 4명까지 같은 전보함을 씁니다.
          </p>
          <button type="button" className="onb-primary" onClick={() => onDone(created.boxId)}>
            전보함 열기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onb">
      <div className="onb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'create'}
          className={`onb-tab ${tab === 'create' ? 'active' : ''}`}
          onClick={() => switchTab('create')}>전보함 만들기</button>
        <button type="button" role="tab" aria-selected={tab === 'join'}
          className={`onb-tab ${tab === 'join' ? 'active' : ''}`}
          onClick={() => switchTab('join')}>코드로 참여</button>
      </div>

      {tab === 'create' ? (
        <form className="onb-panel" onSubmit={create}>
          <div className="onb-field">
            <div className="onb-field-label">전보함 이름</div>
            <input className="onb-input" type="text" value={name} maxLength={20}
              placeholder="예) 퇴근길 전보함, 우리 셋"
              onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="onb-field">
            <div className="onb-field-label">언제 열어볼까요</div>
            <div className="onb-modes">
              <button type="button"
                className={`onb-mode ${sealed ? 'active' : ''}`}
                aria-pressed={sealed}
                onClick={() => setSealed(true)}>
                <span className="onb-mode-name">봉인함</span>
                <span className="onb-mode-desc">
                  남이 보낸 전보는 만나는 날 함께 엽니다. 그전에는 봉투만 보입니다.
                </span>
              </button>
              <button type="button"
                className={`onb-mode ${sealed ? '' : 'active'}`}
                aria-pressed={!sealed}
                onClick={() => setSealed(false)}>
                <span className="onb-mode-name">열린함</span>
                <span className="onb-mode-desc">
                  도착하는 대로 읽습니다.
                </span>
              </button>
            </div>
            <p className="onb-hint">나중에 바꿀 수 있습니다. 내 전보는 언제나 전문으로 보입니다.</p>
          </div>

          {colorFields}
          {error && <p className="onb-error" role="alert">{error}</p>}
          <button className="onb-primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? '만드는 중…' : '전보함 만들기'}
          </button>
        </form>
      ) : (
        <form className="onb-panel" onSubmit={join}>
          <div className="onb-field">
            <div className="onb-field-label">초대 코드</div>
            <input className="onb-input onb-code-input display" type="text" value={code}
              placeholder="ABCD-2345" maxLength={9} autoCapitalize="characters"
              autoComplete="off" spellCheck={false}
              onChange={(e) => setCode(formatCode(e.target.value))} />
          </div>
          {colorFields}
          <p className="onb-hint">
            고른 용지색을 이미 쓰는 사람이 있으면 남은 색으로 바꿔 드립니다.
          </p>
          {error && <p className="onb-error" role="alert">{error}</p>}
          <button className="onb-primary" type="submit" disabled={busy || code.length < 9}>
            {busy ? '들어가는 중…' : '전보함 참여하기'}
          </button>
        </form>
      )}

      {onCancel && <button type="button" className="onb-cancel" onClick={onCancel}>닫기</button>}
    </div>
  );
}
