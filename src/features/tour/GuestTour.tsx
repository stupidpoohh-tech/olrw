import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './GuestTour.css';

/**
 * 체험 모드에서만 뜨는 상황별 안내 카드.
 *
 * 스텝을 순서대로 넘기지 않는다. 각 스텝은 자기 앵커 요소가 화면에 실제로 뜰 때만
 * 등장하고, 한 번 본 스텝은 다시 뜨지 않는다 (localStorage 로 스텝별 기억).
 *
 *   - transmit  → 종이(.paper)가 처음 보일 때
 *   - tabs      → 탭 바(.nav)가 처음 보일 때
 *   - meet      → 만남 마감 버튼이 활성일 때 (전보가 쌓였을 때)
 *
 * 온보딩 화면은 게스트 진입 시 데모 전보함이 자동으로 만들어지므로 스텝이 없다.
 * "다음" 대신 "알겠어요" 로 카드를 닫는다. Esc 도 마찬가지.
 */

const KEY = 'olrw.tour.seen';

interface Step {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly anchor: string;
  /**
   * 앵커가 화면에 있어야 하지만, 그 외의 조건도 볼 때. 함수는 앵커 요소를 받고
   * true 를 돌려주면 카드를 띄운다. 없으면 앵커 존재만으로 뜬다.
   */
  readonly when?: (el: HTMLElement) => boolean;
  /** 카드 자리. 앵커 근처를 피한다. */
  readonly prefer?: 'bl' | 'br';
}

const STEPS: readonly Step[] = [
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
    prefer: 'bl',
  },
  {
    id: 'meet',
    title: '만나서 맺기',
    body:
      '전보가 쌓이면 "만남 마감" 이 열립니다. 봉인이 풀리고 한 통씩 함께 읽은 뒤, ' +
      '그 회차가 한 권으로 제본되어 서가에 꽂힙니다.',
    anchor: '.meet',
    when: (el) => !(el as HTMLButtonElement).disabled,
    prefer: 'br',
  },
] as const;

interface Rect { top: number; left: number; width: number; height: number }

function seenSet(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}
function markSeen(id: string): void {
  try {
    const s = seenSet();
    s.add(id);
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch { /* ignore */ }
}

/** 게스트 재진입 시 스텝을 초기화한다. */
export function resetTour(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function GuestTour() {
  const [seen, setSeen] = useState<Set<string>>(() => seenSet());
  const [active, setActive] = useState<{ step: Step; rect: Rect } | null>(null);

  // 앵커 존재/조건을 지속적으로 감시. 조건이 맞는 첫 스텝을 활성화한다.
  useLayoutEffect(() => {
    let cancelled = false;

    const check = () => {
      if (cancelled) return;
      // 아직 안 본 스텝만 후보.
      const candidate = STEPS.find((s) => !seen.has(s.id));
      if (!candidate) { setActive(null); return; }
      const el = document.querySelector(candidate.anchor) as HTMLElement | null;
      if (!el) { setActive(null); return; }
      if (candidate.when && !candidate.when(el)) { setActive(null); return; }
      // 앵커가 뷰포트 밖이면 안 뜬다. 사용자가 그 화면에 있을 때만.
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) { setActive(null); return; }
      const pad = 4;
      const top = Math.max(pad, r.top - pad);
      const left = Math.max(pad, r.left - pad);
      const right = Math.min(innerWidth - pad, r.right + pad);
      const bottom = Math.min(innerHeight - pad, r.bottom + pad);
      setActive({
        step: candidate,
        rect: { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
      });
    };

    check();
    const raf = requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(document.body);
    window.addEventListener('scroll', check, true);
    window.addEventListener('resize', check);
    // 앵커 등장/사라짐과 disabled 변화를 짧게 재확인
    const poll = window.setInterval(check, 400);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', check, true);
      window.removeEventListener('resize', check);
      window.clearInterval(poll);
    };
  }, [seen]);

  const dismiss = useCallback(() => {
    if (!active) return;
    markSeen(active.step.id);
    setSeen(seenSet());
    setActive(null);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, dismiss]);

  if (!active) return null;

  return createPortal(
    <>
      <div
        className="tour-anchor"
        style={{
          top: `${active.rect.top}px`,
          left: `${active.rect.left}px`,
          width: `${active.rect.width}px`,
          height: `${active.rect.height}px`,
        }}
        aria-hidden="true"
      />
      <aside
        className={`tour-card ${active.step.prefer === 'br' ? 'br' : 'bl'}`}
        role="dialog"
        aria-label="체험 안내"
      >
        <h3 className="tour-title">{active.step.title}</h3>
        <p className="tour-body">{active.step.body}</p>
        <div className="tour-actions">
          <button type="button" className="tour-next" onClick={dismiss}>
            알겠어요
          </button>
        </div>
      </aside>
    </>,
    document.body,
  );
}
