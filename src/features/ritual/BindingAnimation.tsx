import { useEffect, useMemo, useState } from 'react';
import { coverBackground } from '../../design/paper';
import type { CoverKind } from '../../design/colors';
import { sounds } from '../../lib/sounds';
import type { Voice } from '../../design/typewriters';

/**
 * 제본 애니메이션 — docs/PORTING-SPEC.md §6-2. 총 5.8초.
 *
 *   0.0s  phase 0  종이 12장이 사방에서 날아와 쌓임        playRoll
 *   1.6s  phase 1  결 맞추기
 *   2.2s  phase 2  표지가 좌우에서 감쌈                    playRoll
 *   3.4s  phase 3  금박 스탬프 + 흰 플래시 + 스파크 14개   playStamp
 *   4.4s  phase 4  완성                                    playReturn
 *   5.8s  →        onDone()
 *
 * 타임라인과 이징은 확정값이다. 여기서 "개선"하지 않는다.
 */

const STATUS = [
  '종이를 모으는 중 …',
  '결을 맞추는 중 …',
  '표지를 두르는 중 …',
  '금박을 새기는 중 …',
  '완성',
] as const;

interface Props {
  /** 캐리지 소리는 이 전보함의 타자기 것이다. 종이·도장은 공통이다. */
  voice: Voice;
  vol: number;
  title: string;
  count: number;
  coverKind: CoverKind;
  coverValue: string;
  onDone: () => void;
}

export function BindingAnimation({ voice, vol, title, count, coverKind, coverValue, onDone }: Props) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    sounds.playRoll();
    const timers = [
      setTimeout(() => setPhase(1), 1600),
      setTimeout(() => { setPhase(2); sounds.playRoll(); }, 2200),
      setTimeout(() => { setPhase(3); sounds.playStamp(); }, 3400),
      setTimeout(() => { setPhase(4); sounds.playReturn(voice); }, 4400),
      setTimeout(onDone, 5800),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone, voice]);

  // 시작값을 미리 뽑아 CSS 변수로 넣는다.
  // --final 의 ±1.25도가 핵심이다. 완벽히 정렬하면 인쇄물이 아니라 디지털처럼 보인다.
  const pages = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    delay: i * 0.06,
    x: (Math.random() - 0.5) * 420,
    y: (Math.random() - 0.5) * 380,
    rot: (Math.random() - 0.5) * 120,
    final: (Math.random() - 0.5) * 2.5,
  })), []);

  const sparks = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.3;
    const distance = 80 + Math.random() * 60;
    return {
      sx: Math.cos(angle) * distance,
      sy: Math.sin(angle) * distance,
      delay: Math.random() * 0.15,
    };
  }), []);

  const cover = coverBackground(coverKind, coverValue);

  return (
    <div className="bind" role="status" aria-live="polite">
      <div className="bind-scene">
        {pages.map((p, i) => (
          <span
            key={i}
            className="bind-page"
            style={{
              '--x': `${p.x}px`, '--y': `${p.y}px`,
              '--rot': `${p.rot}deg`, '--final': `${p.final}deg`,
              animation: `pageFly 1.1s ${p.delay}s cubic-bezier(.2,.8,.2,1) both`,
              zIndex: i,
            } as React.CSSProperties}
          />
        ))}

        {phase >= 2 && (
          <>
            <span className="bind-cover back" style={{
              background: cover, zIndex: 20,
              animation: 'coverWrapBack .7s cubic-bezier(.4,1.4,.5,1) both',
            }} />
            <span className="bind-cover front" style={{
              background: cover, zIndex: 22,
              animation: 'coverWrapFront .7s cubic-bezier(.4,1.4,.5,1) both',
            }}>
              {coverKind === 'photo' && <span className="bind-cover-scrim" />}
              <span className="bind-gold-edge" />
            </span>
          </>
        )}

        {phase === 3 && <span className="bind-flash" />}

        {phase >= 3 && (
          <span className="bind-stamp" style={{
            animation: 'goldStampIn .7s cubic-bezier(.3,1.6,.4,1) both',
          }}>
            <span className="bind-stamp-vol display tnum">VOL.{vol}</span>
            {title && <span className="bind-stamp-title">{title}</span>}
            <span className="bind-stamp-count display">{count} TELEGRAMS</span>
          </span>
        )}

        {phase >= 3 && (
          <span className="bind-sparks">
            {sparks.map((s, i) => (
              <span key={i} className="bind-spark" style={{
                '--sx': `${s.sx}px`, '--sy': `${s.sy}px`,
                animation: `sparkFly .9s ${s.delay}s ease-out both`,
              } as React.CSSProperties} />
            ))}
          </span>
        )}
      </div>

      <p className="bind-status">{STATUS[phase]}</p>
    </div>
  );
}
