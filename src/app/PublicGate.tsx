import { useCallback, useEffect, useState } from 'react';
import { AuthScreen } from '../features/auth/AuthScreen';
import { LandingScreen } from '../features/landing/LandingScreen';
import { useStore } from '../lib/storeContext';
import { toUserMessage } from '../lib/errors';

/**
 * 로그인하지 않은 사람이 보는 것.
 *
 * 예전에는 로그인 화면이 먼저 섰다. 이 제품은 첫눈에 뭔지 알기 어려워서,
 * 계정을 만들기 전에 무엇인지 볼 수 있어야 한다. 소개 화면이 앞에 서고
 * 거기서 가입·로그인으로 들어간다.
 *
 * 해시로 상태를 남긴다. 화면이 하나 더 생긴 이상 뒤로 가기가 소개로 돌아와야 한다.
 */
type View = { screen: 'landing' } | { screen: 'auth'; mode: 'signin' | 'signup' };

const HASH = { signin: '#login', signup: '#join' } as const;

function read(): View {
  if (typeof location === 'undefined') return { screen: 'landing' };
  if (location.hash === HASH.signin) return { screen: 'auth', mode: 'signin' };
  if (location.hash === HASH.signup) return { screen: 'auth', mode: 'signup' };
  return { screen: 'landing' };
}

export function PublicGate() {
  const store = useStore();
  const [view, setView] = useState<View>(read);
  const [error, setError] = useState('');

  useEffect(() => {
    const onHash = () => setView(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((mode: 'signin' | 'signup') => {
    location.hash = HASH[mode];   // hashchange 가 상태를 옮긴다
  }, []);

  const back = useCallback(() => {
    // 소개에서 들어왔으면 뒤로, 링크로 바로 왔으면 해시만 지운다.
    if (window.history.length > 1) window.history.back();
    else location.hash = '';
  }, []);

  if (view.screen === 'auth') {
    return <AuthScreen initialMode={view.mode} onBack={back} />;
  }
  const enterGuest = () => {
    setError('');
    void store.enterAsGuest().catch((e: unknown) => setError(toUserMessage(e, '체험 모드를 열지 못했습니다.')));
  };

  return (
    <>
      <LandingScreen
        onSignUp={() => go('signup')}
        onSignIn={() => go('signin')}
        onGuest={enterGuest}
      />
      {error && <p className="pg-error" role="alert">{error}</p>}
    </>
  );
}
