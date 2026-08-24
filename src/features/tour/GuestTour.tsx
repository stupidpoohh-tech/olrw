import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './GuestTour.css';

/**
 * 체험 모드에서만 뜨는 안내 카드.
 *
 * 오버레이가 아니라 좌하단(또는 우하단)에 조용히 서 있는 카드다. 앱을 만지면서
 * 읽을 수 있어야 한다. 카드가 가리키는 화면 요소(anchor)에 얇은 테두리를
 * 두른다 — 어디를 보라는 것이지 무엇을 눌러야 앞으로 간다는 것이 아니다.
 * 사용자는 "다음"으로 스텝을 넘긴다.
 *
 * 완료·건너뛰기하면 localStorage 에 표시하고 재접속 시 뜨지 않는다. 랜딩에서
 * '계정 없이 먼저 둘러보기'를 새로 누르면 다시 뜬다.
 */

const KEY = 'olrw.tour.done';

interface Step {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly anchor?: string;
  /** 앵커에 가까우면 카드를 반대편으로 옮긴다. */
  readonly prefer?: 'bl' | 'br';
}

const STEPS: readonly Step[] = [
  {
    id: 'onboard',
    title: '전보함을 하나 만들어 봅니다',
    body:
      '이름을 붙이고, 언제 열어볼지(봉인함/열린함)를 고르고, ' +
      '내 용지 색과 타자기를 정합니다. 나중에 바꿀 수 있습니다.',
    anchor: '.onb-input',
  },
  {
    id: 'transmit',
    title: '종이에 짧게 써 봅니다',
    body:
      '한 통에 100자, "STOP" 으로 문장을 끊는 전보 문법입니다. ' +
      '타자기가 실제로 소리를 냅니다 — 조용히 하려면 아래 스피커 아이콘을 누릅니다.',
    anchor: '.paper',
    prefer: 'br',
  },
  {
    id: 'tabs',
    title: '수신함과 서가',
    body:
      '수신함에는 남이 보낸 전보가 봉투로만 보입니다 — 내용은 만나서 함께 엽니다. ' +
      '체험 모드에서는 다른 참여자가 없어 봉투가 뜨지 않지만, 서가에는 제본된 책이 쌓입니다.',
    anchor: '.nav',
  },
  {
    id: 'meet',
    title: '만나서 맺기',
    body:
      '전보가 쌓이면 "만남 마감"이 열립니다. 봉인이 풀리고 한 통씩 함께 읽은 뒤, ' +
      '그 회차가 한 권으로 제본되어 서가에 꽂힙니다.',
    anchor: '.meet',
    prefer: 'br',
  },
] as const;

interface Rect { top: number; left: number; width: number; height: number }

function isDone(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
function markDone(): void {
  try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
}

export function resetTour(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function GuestTour() {
  const [step, setStep] = useState<number>(() => (isDone() ? -1 : 0));
  const [rect, setRect] = useState<Rect | null>(null);

  const current = step >= 0 ? STEPS[step] : null;

  useLayoutEffect(() => {
    if (!current) return;
    if (!current.anchor) { setRect(null); return; }
    let cancelled = false;
    const selector = current.anchor;

    let scrolled = false;
    const measure = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) { setRect(null); return; }
      // 앵커가 뷰포트 밖이면 한 번만 안으로 데려온다. 매번 하면 사용자 스크롤을 방해한다.
      const r0 = el.getBoundingClientRect();
      if (!scrolled && (r0.bottom < 0 || r0.top > innerHeight - 120)) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        scrolled = true;
      }
      const r = el.getBoundingClientRect();
      if (cancelled) return;
      // 하이라이트가 뷰포트를 넘지 않도록 클립한다.
      const pad = 4;
      const top = Math.max(pad, r.top - pad);
      const left = Math.max(pad, r.left - pad);
      const right = Math.min(innerWidth - pad, r.right + pad);
      const bottom = Math.min(innerHeight - pad, r.bottom + pad);
      setRect({ top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    document.querySelectorAll(selector).forEach((el) => ro.observe(el));
    ro.observe(document.body);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    // 앵커가 아직 안 뜬 경우를 대비해 짧게 재확인 (탭 전환 뒤 등)
    const poll = window.setInterval(measure, 350);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      window.clearInterval(poll);
    };
  }, [current]);

  const next = useCallback(() => {
    setStep((s) => {
      const nxt = s + 1;
      if (nxt >= STEPS.length) { markDone(); return -1; }
      return nxt;
    });
  }, []);

  const skip = useCallback(() => { markDone(); setStep(-1); }, []);

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') skip(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, skip]);

  if (!current) return null;

  return createPortal(
    <>
      {rect && (
        <div
          className="tour-anchor"
          style={{
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          }}
          aria-hidden="true"
        />
      )}
      <aside
        className={`tour-card ${current.prefer === 'br' ? 'br' : 'bl'}`}
        role="dialog"
        aria-label="체험 안내"
      >
        <p className="tour-tag display">{`${step + 1} / ${STEPS.length}`}</p>
        <h3 className="tour-title">{current.title}</h3>
        <p className="tour-body">{current.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-skip" onClick={skip}>건너뛰기</button>
          <button type="button" className="tour-next" onClick={next}>
            {step + 1 === STEPS.length ? '다 봤어요' : '다음'}
          </button>
        </div>
      </aside>
    </>,
    document.body,
  );
}
