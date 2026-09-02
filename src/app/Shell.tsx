import { useCallback, useEffect, useState } from 'react';
import { ArchiveView } from '../features/archive/ArchiveView';
import { InboxView } from '../features/inbox/InboxView';
import { MeetingRitual } from '../features/ritual/MeetingRitual';
import { TransmitView } from '../features/transmit/TransmitView';
import { BoxBar } from '../features/box/BoxBar';
import { BoxOnboard } from '../features/box/BoxOnboard';
import { SettingsModal } from '../features/box/SettingsModal';
import { useSession, useStore } from '../lib/storeContext';
import { toUserMessage } from '../lib/errors';
import type { Box, BoxSummary, Envelope } from '../lib/types';
import { Modal } from './Modal';
import { PublicGate } from './PublicGate';
import { GuestTour } from '../features/tour/GuestTour';
import { MuteButton } from './MakerMark';
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
  const [envelopes, setEnvelopes] = useState<readonly Envelope[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    () => { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } },
  );
  const [tab, setTab] = useState<Tab>('transmit');
  const [addBox, setAddBox] = useState(false);
  const [ritual, setRitual] = useState(false);
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
      if (next) {
        // 봉투와 전보함을 함께 가져온다. 타전실도 수신함도 같은 목록을 본다.
        const [detail, list] = await Promise.all([store.getBox(next), store.listEnvelopes(next)]);
        setBox(detail);
        setEnvelopes(list);
      } else {
        setBox(null);
        setEnvelopes([]);
      }
    } catch (e) {
      setError(toUserMessage(e, '전보함을 불러오지 못했습니다.'));
    }
  }, [store, session, activeId, chooseActive]);

  useEffect(() => { void refresh(); }, [refresh]);

  /**
   * 타전실은 한 화면 안에 세 구역이 들어가야 한다(사용자 지시). 그러려면 루트가
   * 높이를 알아야 하므로 html 에 표시를 남긴다 — min-height 만으로는 자식이
   * 넘칠 때 페이지가 늘어나 타자기가 화면 밖으로 밀려난다.
   * 수신함·서가는 목록이라 평소처럼 페이지가 흐른다.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (session && box && tab === 'transmit') root.setAttribute('data-fixed', '');
    else root.removeAttribute('data-fixed');
    return () => root.removeAttribute('data-fixed');
  }, [session, box, tab]);

  // 로그인하고 나면 #login / #join 을 지운다. 뒤로 가기가 로그인 화면으로 돌아가지 않게.
  useEffect(() => {
    if (session && location.hash) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, [session]);

  /** 전보를 보내거나 회수한 뒤 목록만 다시 읽는다. 전보함까지 다시 읽을 이유는 없다. */
  const reloadEnvelopes = useCallback(async () => {
    if (!box) return;
    try { setEnvelopes(await store.listEnvelopes(box.id)); }
    catch (e) { setError(toUserMessage(e, '전보를 불러오지 못했습니다.')); }
  }, [store, box]);

  const retract = useCallback(async (id: string) => {
    if (!window.confirm('이 전보를 회수합니다.\n한 번 회수하면 되돌릴 수 없습니다.')) return;
    try { await store.deleteTelegram(id); await reloadEnvelopes(); }
    catch (e) { setError(toUserMessage(e, '전보를 회수하지 못했습니다.')); }
  }, [store, reloadEnvelopes]);

  // 로그인 전에는 소개 화면이 선다. 계정을 만들기 전에 무엇인지 볼 수 있어야 한다.
  if (!session) return <PublicGate />;

  // 목록을 아직 못 받았을 때. 로그인 화면이나 온보딩이 번쩍이지 않게 한다.
  if (boxes === null) {
    return <div className="boot"><span className="boot-mark display">OLRW</span></div>;
  }

  const switchTo = (id: string) => { setActiveId(id); setTab('transmit'); };

  if (boxes.length === 0 || !box) {
    return (
      <div className="pair pair-compact">
        {session.isGuest && <GuestTour />}
        {!session.isGuest && (
          <div className="pair-top">
            <span className="pair-greet">
              <span className="pair-greet-tag display">Signed in</span>
              {session.displayName}
            </span>
            <button className="link" onClick={() => void store.signOut()}>로그아웃</button>
          </div>
        )}
        {error && <p className="shell-error" role="alert">{error}</p>}
        <BoxOnboard onDone={switchTo} />
      </div>
    );
  }

  return (
    <div className={`app ${tab === 'transmit' ? 'app-fixed' : ''}`}>
      {session.isGuest && <GuestTour />}
      <header className="header">
        {/* 줄바꿈은 의도다. 폭에 맡기면 'Our love, rightly / written' 으로 끊겨
            제호가 문장처럼 읽힌다. 짧은 화면에서는 CSS 가 이 br 을 지운다. */}
        <h1 className="brand display">Our love, <br />rightly written</h1>
        <div className="header-tools">
          <MuteButton />
          {/* 체험 중에 '로그아웃' 이 서 있으면 로그인한 것처럼 읽힌다. 나갈 문은
              푸터의 '로그인 · 계정 만들기' 이고, 여기는 지금 무엇으로 보고 있는지만
              말한다. 로그인한 사람에게는 그대로 나가는 문이다. */}
          {session.isGuest
            ? <span className="header-state">체험 모드</span>
            : <button className="link" onClick={() => void store.signOut()}>로그아웃</button>}
        </div>
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
        {tab === 'transmit' && (
          <TransmitView
            box={box}
            envelopes={envelopes}
            myId={session.userId}
            send={(body) => store.sendTelegram(box.id, body)}
            onSent={reloadEnvelopes}
            onRetract={retract}
            onOpenRitual={() => setRitual(true)}
            onChanged={() => void refresh()}
          />
        )}
        {tab === 'inbox' && <InboxView box={box} envelopes={envelopes} myId={session.userId} />}
        {tab === 'archive' && <ArchiveView boxId={box.id} />}
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
      {ritual && (
        <MeetingRitual
          box={box}
          envelopes={envelopes}
          onCancel={() => setRitual(false)}
          reload={async () => {
            const list = await store.listEnvelopes(box.id);
            setEnvelopes(list);
            return list;
          }}
          onArchived={() => { setRitual(false); setTab('archive'); void refresh(); }}
        />
      )}
    </div>
  );
}

