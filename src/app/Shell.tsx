import { useCallback, useEffect, useState } from 'react';
import { AuthScreen } from '../features/auth/AuthScreen';
import { BoxBar } from '../features/box/BoxBar';
import { BoxOnboard } from '../features/box/BoxOnboard';
import { SettingsModal } from '../features/box/SettingsModal';
import { useSession, useStore, usingMemoryStore } from '../lib/storeContext';
import { toUserMessage } from '../lib/errors';
import type { Box, BoxSummary } from '../lib/types';
import { Modal } from './Modal';
import './Shell.css';

type Tab = 'transmit' | 'inbox' | 'archive';
const TABS: readonly (readonly [Tab, string])[] = [
  ['transmit', '타전실'], ['inbox', '수신함'], ['archive', '서가'],
];

const ACTIVE_KEY = 'olrw.activeBox';

export function Shell() {
  const store = useStore();
  const session = useSession();

  const [boxes, setBoxes] = useState<readonly BoxSummary[] | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [activeId, setActiveId] = useState<string | null>(
    () => { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } },
  );
  const [tab, setTab] = useState<Tab>('transmit');
  const [addBox, setAddBox] = useState(false);
  const [settings, setSettings] = useState(false);
  const [error, setError] = useState('');

  const chooseActive = useCallback((list: readonly BoxSummary[], want: string | null): string | null => {
    if (want && list.some((b) => b.id === want)) return want;
    return list[0]?.id ?? null;
  }, []);

  const refresh = useCallback(async () => {
    if (!session) { setBoxes(null); setBox(null); return; }
    try {
      setError('');
      const list = await store.listBoxes();
      setBoxes(list);
      const next = chooseActive(list, activeId);
      setActiveId(next);
      try {
        if (next) localStorage.setItem(ACTIVE_KEY, next);
        else localStorage.removeItem(ACTIVE_KEY);
      } catch { /* 스토리지 못 씀 — 세션 동안만 유지된다 */ }
      setBox(next ? await store.getBox(next) : null);
    } catch (e) {
      setError(toUserMessage(e, '전보함을 불러오지 못했습니다.'));
    }
  }, [store, session, activeId, chooseActive]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!session) return <AuthScreen />;

  // 목록을 아직 못 받았을 때. 로그인 화면이나 온보딩이 번쩍이지 않게 한다.
  if (boxes === null) {
    return <div className="boot"><span className="boot-mark display">OLRW</span></div>;
  }

  const switchTo = (id: string) => { setActiveId(id); setTab('transmit'); };

  if (boxes.length === 0 || !box) {
    return (
      <div className="pair">
        <div className="pair-top">
          <span className="pair-greet">
            <span className="pair-greet-tag display">Signed in</span>
            {session.displayName}
          </span>
          <button className="link" onClick={() => void store.signOut()}>로그아웃</button>
        </div>
        <h2 className="pair-title display">첫 전보함을 엽니다</h2>
        <p className="pair-sub">
          전보함을 <b>만들어</b> 코드를 나눠주거나, 받은 <b>코드로 참여</b>하세요.<br />
          최대 4명이 같은 전보함에서 전보를 주고받습니다.
        </p>
        {error && <p className="shell-error" role="alert">{error}</p>}
        <BoxOnboard onDone={switchTo} />
        {usingMemoryStore && <MemoryNotice />}
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand display">Our love, rightly written</h1>
        <button className="link" onClick={() => void store.signOut()}>로그아웃</button>
      </header>

      <nav className="nav" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key}
            className={`nav-btn ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}>{label}</button>
        ))}
      </nav>

      <BoxBar
        box={box}
        boxes={boxes}
        onSwitch={switchTo}
        onAddBox={() => setAddBox(true)}
        onSettings={() => setSettings(true)}
        onChanged={() => void refresh()}
      />

      {error && <p className="shell-error" role="alert">{error}</p>}

      <main className="main">
        {/* 단계 4에서 타전실 · 수신함 · 서가가 들어온다. */}
        <Placeholder tab={tab} box={box} />
      </main>

      {addBox && (
        <Modal title="새 전보함" onClose={() => setAddBox(false)} wide>
          <BoxOnboard
            onDone={(id) => { setAddBox(false); switchTo(id); void refresh(); }}
            onCancel={() => setAddBox(false)}
          />
        </Modal>
      )}
      {settings && (
        <SettingsModal
          box={box}
          displayName={session.displayName}
          onClose={() => setSettings(false)}
          onSaved={() => void refresh()}
        />
      )}
      {usingMemoryStore && <MemoryNotice />}
    </div>
  );
}

function Placeholder({ tab, box }: { tab: Tab; box: Box }) {
  const label = TABS.find(([k]) => k === tab)?.[1] ?? '';
  return (
    <div className="placeholder fade-up">
      <div className="placeholder-vol display tnum">VOL.{box.currentVol}</div>
      <p className="placeholder-text">
        {label}은 단계 4에서 들어옵니다.
      </p>
      <p className="placeholder-sub">
        {box.sealed
          ? '이 전보함은 봉인함입니다. 남이 보낸 이번 권 전보는 만나는 날 함께 열립니다.'
          : '이 전보함은 열린함입니다. 전보가 도착하는 대로 읽습니다.'}
      </p>
    </div>
  );
}

function MemoryNotice() {
  return (
    <p className="memory-notice">
      Supabase 환경변수가 없어 브라우저 안의 임시 저장소로 돌고 있습니다.
      이 기기에서만 보이고, 다른 사람과 이어지지 않습니다.
    </p>
  );
}
