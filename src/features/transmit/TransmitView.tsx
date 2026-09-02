import { useEffect, useState } from 'react';
import { sounds } from '../../lib/sounds';
import { TYPE_IDS, getTypewriter, type TypeId } from '../../design/typewriters';
import { useStore } from '../../lib/storeContext';
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
  /** 타자기를 바꾸면 전보함을 다시 읽는다. */
  onChanged: () => void;
}

export function TransmitView({ box, envelopes, myId, onSent, onRetract, onOpenRitual, send, onChanged }: Props) {
  const store = useStore();
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState('');

  /**
   * 타자기는 좌우로 넘겨 바꾼다. 서버 왕복을 기다리면 손끝이 굼떠 보이므로
   * 화면부터 바꾸고(낙관적) 저장은 뒤에서 한다. 저장이 실패하면 되돌린다.
   */
  const [localType, setLocalType] = useState<TypeId | null>(null);
  useEffect(() => { setLocalType(null); }, [box.id, box.myType]);
  const myType = localType ?? box.myType;

  const stepType = (dir: -1 | 1) => {
    const i = TYPE_IDS.indexOf(myType);
    const next = TYPE_IDS[(i + dir + TYPE_IDS.length) % TYPE_IDS.length]!;
    setLocalType(next);
    sounds.playKey(getTypewriter(next).voice);   // 바뀐 소리를 바로 들려준다
    void store.setMyColors(box.id, { type: next })
      .then(onChanged)
      .catch((e: unknown) => {
        setLocalType(null);
        setError(toUserMessage(e, '타자기를 바꾸지 못했습니다.'));
      });
  };

  const mine = envelopes.filter((e) => e.authorId === myId);
  const total = envelopes.length;

  const handleSend = async (body: string) => {
    if (sending || !body) return;
    setError('');
    setSending(true);
    sounds.playReturn(getTypewriter(myType).voice);
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
      {/* 1·2구역 — 타자기와 종이. 화면이 좁으면 타자기가 먼저 줄어든다. */}
      <Paper
        paper={box.myPaper}
        typeColor={myType}
        sending={sending}
        justSent={justSent}
        onSend={(body) => void handleSend(body)}
        onStepType={stepType}
      />

      {error && <p className="transmit-error" role="alert">{error}</p>}

      {/* 3구역 — 내가 쓴 전보. 남은 높이를 다 쓰고 여기 안에서만 스크롤한다.
          비어 있을 때도 머리글을 세운다 — 그래야 빈 자리가 '아직 없는 섹션'으로
          읽히고, 남은 공백이 버려진 자리로 보이지 않는다. */}
      <section className="recent">
        <div className="recent-head">
          <h2 className="section-label">보낸 전보</h2>
          {mine.length > 0 && <span className="section-count display tnum">{mine.length}</span>}
        </div>
        {mine.length > 0 ? (
          <>
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
          </>
        ) : (
          <p className="recent-empty">보낸 전보가 여기 쌓입니다.</p>
        )}
      </section>

      <button className="meet" onClick={onOpenRitual} disabled={total === 0}>
        <span className="meet-mark display" aria-hidden="true">⏎</span>
        만남 마감 — 이번 권 닫기
        <span className="meet-mark display" aria-hidden="true">⏎</span>
      </button>
    </div>
  );
}
