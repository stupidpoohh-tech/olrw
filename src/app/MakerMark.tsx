import { useEffect, useState } from 'react';
import { isMuted, onMuteChange, setMuted } from '../lib/mute';
import './MakerMark.css';

/**
 * 만든 사람 표시 + 기기 단위 음소거.
 *
 * 앱 최하단 가운데. 홈 링크는 새 탭으로 연다 — 타전 중인 초고를 잃지 않게.
 * 스피커 아이콘 하나로 이 기기의 모든 타건음·벨·캐리지·제본음을 켜고 끈다.
 */
export function MakerMark() {
  const [muted, setMutedState] = useState<boolean>(() => isMuted());
  useEffect(() => onMuteChange(setMutedState), []);

  return (
    <footer className="maker">
      <button
        type="button"
        className="maker-mute"
        aria-pressed={muted}
        aria-label={muted ? '소리 켜기' : '소리 끄기'}
        title={muted ? '소리 켜기' : '소리 끄기'}
        onClick={() => setMuted(!muted)}
      >
        <SpeakerIcon muted={muted} />
      </button>

      <span className="maker-text">
        만든사람 <b className="maker-name">DADA</b>
      </span>

      <a
        className="maker-home"
        href="https://dada-town.com/"
        target="_blank"
        rel="noreferrer"
        aria-label="DADA 홈으로 (새 탭)"
        title="DADA 홈"
      >
        <HomeIcon />
      </a>
    </footer>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M3.4 9.1 10 3.6l6.6 5.5M5.1 8.1v7.6a.7.7 0 0 0 .7.7h8.4a.7.7 0 0 0 .7-.7V8.1"
        fill="none" stroke="currentColor" strokeWidth="1.3"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M4 8 v4 h3 l4 3 V5 L7 8 Z"
        fill="none" stroke="currentColor" strokeWidth="1.3"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {muted ? (
        <path d="M14 8 l3 4 M17 8 l-3 4" fill="none" stroke="currentColor"
              strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path d="M13.5 7.5 a4 4 0 0 1 0 5 M15.5 6 a6.5 6.5 0 0 1 0 8"
              fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      )}
    </svg>
  );
}
