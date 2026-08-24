import { useEffect, useState } from 'react';
import { paperStyle, paperSwatchStyle } from '../../design/paper';
import { stamp } from '../../lib/format';
import { sounds } from '../../lib/sounds';
import { getTypewriter } from '../../design/typewriters';
import type { Box, Envelope } from '../../lib/types';
import { FormattedText } from '../telegram/FormattedText';

/**
 * 함께 읽기 (docs/decisions.md D2).
 *
 * 만나서 그 말들을 실제로 나누는 순간이다. 제본은 그 순간의 결과이지 사건이 아니다.
 * 한 화면에 한 통씩, 넘길 때 캐리지 소리가 난다.
 *
 * 건너뛸 수 있다 — 카페에서 넷이 서른 통을 다 넘기지는 않는다. 건너뛰면
 * `read_together = false` 로 남아 권 안쪽에 기록된다.
 */
interface Props {
  box: Box;
  envelopes: readonly Envelope[];
  onFinish: (readTogether: boolean) => void;
}

export function PhaseReading({ box, envelopes, onFinish }: Props) {
  const [i, setI] = useState(0);
  const voice = getTypewriter(box.myType).voice;
  const pages = [...envelopes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const page = pages[i];

  const nameOf = (id: string) => box.members.find((m) => m.userId === id)?.displayName ?? '알 수 없음';
  const paperOf = (id: string) => box.members.find((m) => m.userId === id)?.paper ?? 'ivory';

  const next = () => {
    if (i + 1 >= pages.length) { onFinish(true); return; }
    sounds.playReturn(voice);
    setI((n) => n + 1);
  };
  const prev = () => { if (i > 0) { sounds.playReturn(voice); setI((n) => n - 1); } };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!page) {
    return (
      <div className="rt-card">
        <p className="rt-lead display">— Reading Together —</p>
        <h2 className="rt-title">읽을 전보가 없습니다</h2>
        <div className="rt-btns">
          <button className="onb-primary" onClick={() => onFinish(false)}>다음</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rt-card wide">
      <p className="rt-lead display">— Reading Together —</p>
      <h2 className="rt-title">함께 읽습니다</h2>
      <p className="rt-sub">한 통씩 넘기며 읽어 보세요. 다 읽으면 제본으로 넘어갑니다.</p>

      <div className="read-page" key={page.id} style={paperStyle(paperOf(page.authorId))}>
        <div className="read-from">
          <span className="read-swatch" style={paperSwatchStyle(paperOf(page.authorId))} />
          {nameOf(page.authorId)}
        </div>
        <p className="read-body"><FormattedText text={page.body ?? ''} /></p>
        <div className="read-time tnum">{stamp(page.createdAt)}</div>
      </div>

      <div className="read-nav">
        <button className="link" onClick={prev} disabled={i === 0}>← 앞으로</button>
        <span className="read-count tnum display">{i + 1} / {pages.length}</span>
        <button className="link" onClick={next}>
          {i + 1 >= pages.length ? '다 읽었습니다 →' : '다음 →'}
        </button>
      </div>

      <button className="rt-skip" onClick={() => onFinish(false)}>건너뛰고 제본하기</button>
    </div>
  );
}
