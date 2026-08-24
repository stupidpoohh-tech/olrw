import { useState } from 'react';
import { sounds } from '../../lib/sounds';
import { toUserMessage } from '../../lib/errors';
import type { Box, Envelope } from '../../lib/types';
import { TelegramCard } from '../telegram/TelegramCard';
import { Paper } from './Paper';
import './TransmitView.css';

interface Props {
  box: Box;
  envelopes: readonly Envelope[];
  myId: string;
  onSent: () => void | Promise<void>;
  onRetract: (id: string) => void | Promise<void>;
  onOpenRitual: () => void;
  send: (body: string) => Promise<void>;
}

export function TransmitView({ box, envelopes, myId, onSent, onRetract, onOpenRitual, send, }: Props) {
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState('');

  const mine = envelopes.filter((e) => e.authorId === myId);
  const total = envelopes.length;

  const handleSend = async (body: string) => {
    if (sending || !body) return;
    setError('');
    setSending(true);
    sounds.playReturn();
    try {
      // 캐리지가 돌아가는 동안 기다린다. 이 0.7초가 "타전했다"는 감각을 만든다.
      await new Promise((r) => setTimeout(r, 700));
      await send(body);
      await onSent();
      setJustSent(true);
      setTimeout(() => setJustSent(false), 2400);
    } catch (e) {
      // 참조 구현은 실패해도 아무 말이 없었다. (docs/AUDIT.md §04-3)
      setError(toUserMessage(e, '전보를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="transmit fade-up">
      <Paper
        paper={box.myPaper}
        typeColor={box.myType}
        sending={sending}
        justSent={justSent}
        onSend={(body) => void handleSend(body)}
      />

      {error && <p className="transmit-error" role="alert">{error}</p>}

      {mine.length > 0 && (
        <section className="recent">
          <h2 className="section-label display">최근 송신 · Recent · {mine.length}</h2>
          <div className="recent-list">
            {mine.map((e) => (
              <TelegramCard
                key={e.id}
                id={e.id}
                paper={box.myPaper}
                author="나"
                body={e.body ?? ''}
                sentAt={e.createdAt}
                mine
                onRetract={(id) => void onRetract(id)}
              />
            ))}
          </div>
        </section>
      )}

      <button className="meet" onClick={onOpenRitual} disabled={total === 0}>
        <span className="meet-mark display" aria-hidden="true">⏎</span>
        만남 마감 — 이번 권 닫기
        <span className="meet-mark display" aria-hidden="true">⏎</span>
      </button>
      {total === 0 && <p className="meet-hint">전보가 한 통이라도 쌓이면 권을 닫을 수 있습니다.</p>}
    </div>
  );
}
