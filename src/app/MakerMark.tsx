import './MakerMark.css';

/**
 * 만든 사람 표시. 모든 화면 맨 아래에 선다.
 * 새 탭으로 연다 — 타전 중인 초고를 잃지 않게.
 */
export function MakerMark() {
  return (
    <footer className="maker">
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
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" focusable="false">
          <path
            d="M3.4 9.1 10 3.6l6.6 5.5M5.1 8.1v7.6a.7.7 0 0 0 .7.7h8.4a.7.7 0 0 0 .7-.7V8.1"
            fill="none" stroke="currentColor" strokeWidth="1.3"
            strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
      </a>
    </footer>
  );
}
