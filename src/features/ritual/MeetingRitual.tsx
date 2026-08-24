import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CoverKind } from '../../design/colors';
import { coverBackground } from '../../design/paper';
import { period } from '../../lib/format';
import { toUserMessage } from '../../lib/errors';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useStore } from '../../lib/storeContext';
import type { Box, Envelope } from '../../lib/types';
import { BindingAnimation } from './BindingAnimation';
import { PhaseCustomize } from './PhaseCustomize';
import { PhaseReading } from './PhaseReading';
import './ritual.css';

/**
 * 만남 마감 — docs/decisions.md D2.
 *
 *   confirm → 함께 읽기 → customize → binding → done
 *
 * 참조 구현은 4단계였고 '함께 읽기'가 없었다. 만나서 그 말들을 나누는 순간이
 * 통째로 빠져 있어서, 제본 애니메이션이 의식의 마침표가 아니라 로딩 화면이었다.
 */
type Phase = 'confirm' | 'reading' | 'customize' | 'binding' | 'done';

interface CoverChoice { kind: CoverKind; value: string; preview?: string; file?: Blob }

interface Props {
  box: Box;
  envelopes: readonly Envelope[];
  onCancel: () => void;
  /** 제본이 끝났다. 서가로 보낸다. */
  onArchived: () => void;
  /** 봉인이 풀린 뒤 봉투를 다시 읽는다. */
  reload: () => Promise<readonly Envelope[]>;
}

export function MeetingRitual({ box, envelopes, onCancel, onArchived, reload }: Props) {
  const store = useStore();
  const reduced = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('confirm');
  const [pages, setPages] = useState<readonly Envelope[]>(envelopes);
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState<CoverChoice>({ kind: 'color', value: 'sage' });
  const [readTogether, setReadTogether] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** 제본은 애니메이션과 나란히 돈다. 5.8초를 기다린 뒤 다시 기다리게 하지 않는다. */
  const [bound, setBound] = useState<Promise<string> | null>(null);

  const count = pages.length;
  const sealed = pages.filter((e) => !e.unsealed).length;

  useEffect(() => {
    // 제본 중에는 닫을 수 없다. 그 밖에는 Escape 로 나간다.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'binding' && phase !== 'done') onCancel();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [phase, onCancel]);

  /** confirm → 함께 읽기. 여기서 이번 권의 봉인이 풀린다. */
  const startReading = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await store.beginReading(box.id);
      setPages(await reload());
      setPhase('reading');
    } catch (e) {
      setError(toUserMessage(e, '봉인을 풀지 못했습니다.'));
    } finally { setBusy(false); }
  };

  /** customize → binding. 표지를 올리고 제본을 시작한다. */
  const startBinding = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      let coverKind: CoverKind = cover.kind;
      let coverValue = cover.value;

      if (cover.kind === 'photo' && cover.file) {
        coverValue = await store.uploadCover(box.id, cover.file);
        coverKind = 'photo';
      }
      if (coverKind === 'photo' && !coverValue) throw new Error('표지 사진을 올리지 못했습니다.');

      // 애니메이션과 나란히 시작한다.
      setBound(store.closeVolume(box.id, { title, coverKind, coverValue, readTogether }));
      setPhase('binding');
    } catch (e) {
      setError(toUserMessage(e, '제본을 시작하지 못했습니다.'));
    } finally { setBusy(false); }
  };

  /** 애니메이션이 끝났다. 서버가 아직이면 그때 기다린다. */
  const finishBinding = useCallback(() => {
    void (async () => {
      try {
        await bound;
        setPhase('done');
      } catch (e) {
        setError(toUserMessage(e, '제본에 실패했습니다.'));
        setPhase('customize');
      }
    })();
  }, [bound]);

  // 모션을 줄이는 설정이면 5.8초 타임라인을 건너뛴다.
  // CSS 로 애니메이션만 꺼 두면 그동안 빈 화면을 보게 된다. (§6-2)
  useEffect(() => {
    if (phase !== 'binding' || !reduced) return;
    const t = setTimeout(finishBinding, 400);
    return () => clearTimeout(t);
  }, [phase, reduced, finishBinding]);

  const body = (() => {
    switch (phase) {
      case 'confirm':
        return (
          <div className="rt-card">
            <p className="rt-lead display">— Closing the Volume —</p>
            <h2 className="rt-title">이번 권을 닫습니다</h2>
            <p className="rt-sub">지금까지의 전보를 한 권으로 묶어 서가에 보관합니다.</p>

            <div className="rt-meta">
              <div className="rt-meta-item">
                <div className="rt-meta-num display tnum">VOL.{box.currentVol}</div>
                <div className="rt-meta-label display">Volume</div>
              </div>
              <div className="rt-meta-item">
                <div className="rt-meta-num display tnum">{count}</div>
                <div className="rt-meta-label display">Telegrams</div>
              </div>
            </div>

            {count > 0 && (
              <p className="rt-period tnum">
                {period(
                  pages[pages.length - 1]?.createdAt ?? '',
                  pages[0]?.createdAt ?? '',
                )}
              </p>
            )}

            {/* D4 완충 — 마감 권한은 누구에게나 열려 있다. 최소한 무엇이 열리는지는 알린다. */}
            {sealed > 0 && (
              <p className="rt-warn">
                아직 봉인된 전보 {sealed}통이 지금 열립니다.<br />
                한 번 열린 권은 다시 봉인되지 않습니다.
              </p>
            )}

            {error && <p className="onb-error" role="alert">{error}</p>}

            <div className="rt-btns">
              <button className="btn-ghost" onClick={onCancel} disabled={busy}>취소</button>
              <button className="onb-primary" onClick={() => void startReading()} disabled={busy || count === 0}>
                {busy ? '여는 중…' : '다음 →'}
              </button>
            </div>
          </div>
        );

      case 'reading':
        return (
          <PhaseReading
            box={box}
            envelopes={pages}
            onFinish={(together) => { setReadTogether(together); setPhase('customize'); }}
          />
        );

      case 'customize':
        return (
          <>
            {error && <p className="onb-error rt-floating-error" role="alert">{error}</p>}
            <PhaseCustomize
              vol={box.currentVol}
              title={title} setTitle={setTitle}
              cover={cover} setCover={setCover}
              onBack={() => setPhase('reading')}
              onBind={() => void startBinding()}
              busy={busy}
            />
          </>
        );

      case 'binding':
        return reduced ? (
          <div className="rt-card rt-quiet">
            <p className="rt-lead display">— Binding —</p>
            <h2 className="rt-title">제본하는 중</h2>
          </div>
        ) : (
          <BindingAnimation
            vol={box.currentVol}
            title={title}
            count={count}
            coverKind={cover.kind}
            coverValue={cover.kind === 'photo' ? (cover.preview ?? cover.value) : cover.value}
            onDone={finishBinding}
          />
        );

      case 'done':
        return (
          <div className="rt-card">
            <div className="rt-book" style={{
              background: coverBackground(
                cover.kind,
                cover.kind === 'photo' ? (cover.preview ?? cover.value) : cover.value,
              ),
            }}>
              {/* §4-3: 사진 위 글자는 스크림 없이 읽히지 않는다 */}
              {cover.kind === 'photo' && <span className="rt-book-scrim" />}
              <span className="rt-book-edge" />
              <span className="rt-book-label">
                <span className="display tnum">VOL.{box.currentVol}</span>
                {title && <span className="rt-book-title">{title}</span>}
              </span>
            </div>
            <p className="rt-lead display">— Archived —</p>
            <h2 className="rt-title">보관 완료</h2>
            <p className="rt-sub">
              {count}통의 전보가 서가에 꽂혔습니다.<br />
              새로운 권이 시작됩니다.
            </p>
            {!readTogether && <p className="rt-note">함께 읽기를 건너뛰고 제본했습니다.</p>}
            <div className="rt-btns">
              <button className="onb-primary" onClick={onArchived}>서가에서 보기</button>
            </div>
          </div>
        );
    }
  })();

  return createPortal(
    <div className="rt-stage" role="dialog" aria-modal="true" aria-label="만남 마감">
      {body}
    </div>,
    document.body,
  );
}
