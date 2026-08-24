import { useState, type FormEvent } from 'react';
import { useStore } from '../../lib/storeContext';
import { toUserMessage } from '../../lib/errors';
import './AuthScreen.css';

type Mode = 'signin' | 'signup';

interface Props {
  initialMode?: Mode;
  /** 소개 화면으로 돌아간다. */
  onBack?: (() => void) | undefined;
}

export function AuthScreen({ initialMode = 'signin', onBack }: Props) {
  const store = useStore();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') await store.signUp({ email, password, displayName });
      else await store.signIn({ email, password });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: Mode) => { setMode(m); setError(''); };

  return (
    <div className="auth">
      <div className="auth-card">
        {onBack && (
          <button type="button" className="auth-back" onClick={onBack}>← 돌아가기</button>
        )}
        <div className="auth-mark display">OLRW</div>
        <h1 className="auth-title display">Our love,<br />rightly written</h1>
        <p className="auth-sub">
          {mode === 'signup'
            ? '계정을 만들어 전보함을 시작하세요.'
            : '로그인하고 이어서 전보를 나눕니다.'}
        </p>

        <div className="auth-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'signin'}
            className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => switchTo('signin')}>로그인</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'}
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => switchTo('signup')}>가입</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="auth-field">
              <span className="auth-label">표시 이름</span>
              <input className="auth-input" type="text" value={displayName} maxLength={12}
                autoComplete="nickname" placeholder="전보함에서 보일 이름"
                onChange={(e) => setDisplayName(e.target.value)} />
            </label>
          )}
          <label className="auth-field">
            <span className="auth-label">이메일</span>
            <input className="auth-input" type="email" value={email} required
              autoComplete="email" inputMode="email" placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="auth-field">
            <span className="auth-label">비밀번호</span>
            <input className="auth-input" type="password" value={password} required minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="6자 이상"
              onChange={(e) => setPassword(e.target.value)} />
          </label>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy ? (mode === 'signup' ? '만드는 중…' : '들어가는 중…')
                  : (mode === 'signup' ? '계정 만들기' : '로그인')}
          </button>
        </form>
      </div>
    </div>
  );
}
