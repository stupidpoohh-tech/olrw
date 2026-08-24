import { useCallback, useEffect, useRef, useState } from 'react';
import type { PaperId } from '../../design/colors';
import { getTypewriter, type TypeId } from '../../design/typewriters';
import { paperStyle } from '../../design/paper';
import { sounds } from '../../lib/sounds';
import { FormattedText } from '../telegram/FormattedText';
import { Typewriter } from './Typewriter';
import { isTypingKey, keyPos, type KeyPos } from './keys';

export const CHAR_LIMIT = 100;
const BELL_AT = 85;

interface Props {
  paper: PaperId;
  typeColor: TypeId;
  sending: boolean;
  justSent: boolean;
  onSend: (body: string) => void;
  /** 타자기를 좌우로 넘긴다. 없으면 넘기기 UI 를 숨긴다. */
  onStepType?: ((dir: -1 | 1) => void) | undefined;
}

export function Paper({ paper, typeColor, sending, justSent, onSend, onStepType }: Props) {
  const machine = getTypewriter(typeColor);
  const [text, setText] = useState('');
  const [pressed, setPressed] = useState<{ pos: KeyPos; id: number } | null>(null);
  const [bell, setBell] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const bellRung = useRef(false);
  const pressTimer = useRef<number | undefined>(undefined);
  const bellTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    window.clearTimeout(pressTimer.current);
    window.clearTimeout(bellTimer.current);
  }, []);

  // 송신이 끝나면 종이를 비운다.
  useEffect(() => { if (justSent) { setText(''); bellRung.current = false; } }, [justSent]);

  /**
   * 타건음과 해머는 **물리 키를 누를 때** 낸다. 입력값이 바뀔 때가 아니다.
   *
   * 한글은 한 글자를 만드는 데 조합이 여러 번 일어나고, 그때마다 입력값이 바뀐다.
   * 값 변화에 소리를 걸면 'ㅎ→하→한' 에서 세 번 울린다. (docs/AUDIT.md §04-3)
   */
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !composing.current) {
      e.preventDefault();
      const body = text.trim();
      if (body && body.length <= CHAR_LIMIT && !sending) onSend(body);
      return;
    }
    if (!isTypingKey(e)) return;

    sounds.playKey(machine.voice);
    const pos = keyPos(machine, e.code);
    if (pos) {
      setPressed({ pos, id: Date.now() + Math.random() });
      window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => setPressed(null), 130);
    }
  }, [text, sending, onSend, machine]);

  /** 글자 수는 입력값에서 센다. 조합 중에는 자르지 않는다 — 자르면 조합이 깨진다. */
  const clamp = (v: string) => (composing.current ? v : v.slice(0, CHAR_LIMIT));

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = clamp(e.target.value);
    setText(next);

    // 벨은 한 통에 한 번만 울린다.
    if (!bellRung.current && next.length >= BELL_AT) {
      bellRung.current = true;
      sounds.playBell(machine.voice);
      setBell(true);
      window.clearTimeout(bellTimer.current);
      bellTimer.current = window.setTimeout(() => setBell(false), 700);
    }
    if (next.length < BELL_AT) bellRung.current = false;
  };

  const ratio = Math.min(text.length / CHAR_LIMIT, 1);
  const over = text.length > CHAR_LIMIT;
  const level = over ? 'danger' : text.length >= BELL_AT ? 'warn' : '';
  const canSend = text.trim().length > 0 && !over && !sending;

  return (
    <div className="stage">
      <Typewriter machine={machine} pressed={pressed} bell={bell} onStep={onStepType} />

      <div className="paper-wrap">
        <div className="paper" style={paperStyle(paper)} onClick={() => input.current?.focus()}>
          <div className="paper-head display">
            <span>No.{String(450 + (text.length % 999)).padStart(4, '0')}</span>
            <span>Telegram</span>
            <span>Priority</span>
          </div>

          <div className="paper-type">
            <textarea
              ref={input}
              className="paper-input"
              value={text}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onCompositionStart={() => { composing.current = true; }}
              onCompositionEnd={(e) => {
                composing.current = false;
                setText(e.currentTarget.value.slice(0, CHAR_LIMIT));
              }}
              disabled={sending}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="전보 본문"
            />
            <div className="paper-ink" aria-hidden="true">
              {text.length === 0 && !sending && <span className="paper-ghost">전할 말을 짧게…</span>}
              <FormattedText text={text} />
              {!sending && <span className="paper-caret" />}
            </div>
          </div>

          <div className="paper-foot">
            <div className="gauge"><div className={`gauge-fill ${level}`} style={{ width: `${ratio * 100}%` }} /></div>
            <div className="paper-actions">
              <span className={`count tnum ${level}`}>{text.length} / {CHAR_LIMIT}</span>
              <button className="send" onClick={() => onSend(text.trim())} disabled={!canSend}>
                {sending ? '송신 중…' : '송신'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {justSent && <div className="sent display">SENT</div>}
    </div>
  );
}
