import { useCallback, useEffect, useState } from 'react';
import { AuthScreen } from '../features/auth/AuthScreen';
import { useStore } from '../lib/storeContext';
import { toUserMessage } from '../lib/errors';

/**
 * 로그인하지 않은 사람이 보는 것.
 *
 * 예전에는 소개 화면(LandingScreen)이 먼저 섰다. 그러나 소개는 투어가 이미 맡고
 * 있으니 소개용 화면을 따로 세우지 않는다 — 미로그인 방문자는 곧장 체험 모드로
 * 진입하고, 앱을 실제로 만지면서 4 스텝 투어를 본다. (D11 번복)
 *
 * 로그인/가입은 여전히 존재한다. 해시(`#login` / `#join`)로 진입하면 AuthScreen 이
 * 뜨고, 그 진입 링크는 게스트 배너 안에 놓인다.
 */
type View = { screen: 'guest' } | { screen: 'auth'; mode: 'signin' | 'signup' };

const HASH = { signin: '#login', signup: '#join' } as const;

function read(): View {
  if (typeof location === 'undefined') return { screen: 'guest' };
  if (location.hash === HASH.signin) return { screen: 'auth', mode: 'signin' };
  if (location.hash === HASH.signup) return { screen: 'auth', mode: 'signup' };
  return { screen: 'guest' };
}

export function PublicGate() {
  const store = useStore();
  const [view, setView] = useState<View>(read);
  const [error, setError] = useState('');
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    const onHash = () => setView(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // 게스트 화면이면 즉시 체험 모드로 진입한다. 여기서만 실행되므로 로그인·가입
  // 해시로 들어온 경우에는 자동 진입하지 않는다.
  useEffect(() => {
    if (view.screen !== 'guest' || entering) return;
    setEntering(true);
    void store.enterAsGuest().catch((e: unknown) => {
      setError(toUserMessage(e, '체험 모드를 열지 못했습니다.'));
      setEntering(false);
    });
  }, [view, entering, store]);

  const back = useCallback(() => {
    // 로그인·가입에서 뒤로가기 = 게스트 화면(홈)으로.
    if (window.history.length > 1) window.history.back();
    else location.hash = '';
  }, []);

  if (view.screen === 'auth') {
    return <AuthScreen initialMode={view.mode} onBack={back} />;
  }

  // 게스트 진입이 걸리는 짧은 순간에도 로딩 마크가 보인다.
  return (
    <>
      <div className="boot"><span className="boot-mark display">OLRW</span></div>
      {error && <p className="pg-error" role="alert">{error}</p>}
    </>
  );
}
