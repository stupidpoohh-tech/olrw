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
  /** 가입은 됐지만 메일 확인이 남았을 때. */
  const [pendingEmail, setPendingEmail] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await store.signUp({ email, password, displayName });
        // 확인이 필요하면 세션이 없다. 아무 말도 안 하면 버튼이 먹통인 줄 안다.
        if (needsConfirmation) setPendingEmail(email.trim());
      } else {
        await store.signIn({ email, password });
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: Mode) => { setMode(m); setError(''); setPendingEmail(''); };

  if (pendingEmail) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-mark display">OLRW</div>
          <h1 className="auth-title display">메일함을<br />확인해 주세요</h1>
          <p className="auth-sub">
            <b>{pendingEmail}</b> 으로 확인 링크를 보냈습니다.<br />
            링크를 누르면 전보함으로 들어옵니다.
          </p>
          <p className="auth-hint">
            메일이 오지 않으면 스팸함을 확인해 주세요.
          </p>
          <button type="button" className="auth-submit"
            onClick={() => { setPendingEmail(''); setMode('signin'); }}>
            로그인 화면으로
          </button>
          {onBack && <button type="button" className="auth-back auth-back-bottom" onClick={onBack}>← 돌아가기</button>}
        </div>
      </div>
    );
  }

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
            {/* 서버(Better Auth)가 요구하는 최소는 8자다. 6으로 두면 브라우저는
                통과시키고 서버가 막아, 사용자는 왜 막혔는지 모른 채 서 있게 된다. */}
            <input className="auth-input" type="password" value={password} required minLength={8}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              placeholder="8자 이상"
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
