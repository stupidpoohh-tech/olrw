import { useState, type FormEvent } from 'react';
import { useStore } from '../../lib/storeContext';
import { toUserMessage } from '../../lib/errors';
import './AuthScreen.css';

/**
 * signin · signup 은 탭이고, forgot · reset 은 그 뒤에 오는 두 걸음이다.
 *   forgot — 메일을 보내 달라고 한다
 *   reset  — 메일 링크를 타고 돌아와 새 비밀번호를 정한다 (URL 에 token 이 있다)
 */
type Mode = 'signin' | 'signup' | 'forgot' | 'reset';

interface Props {
  initialMode?: Mode;
  /** 메일 링크로 돌아왔을 때 URL 에 실려 온 토큰. 있으면 reset 으로 연다. */
  resetToken?: string | undefined;
  /** 화면을 열면서 먼저 알릴 말. 만료된 링크로 돌아왔을 때 쓴다. */
  notice?: string | undefined;
  /** 소개 화면으로 돌아간다. */
  onBack?: (() => void) | undefined;
}

export function AuthScreen({ initialMode = 'signin', resetToken, notice: opening, onBack }: Props) {
  const store = useStore();
  const [mode, setMode] = useState<Mode>(initialMode);
  /** 화면 위에 남기는 한 줄. 만료 안내로 시작하고, 재설정을 마치면 그 말로 바뀐다. */
  const [notice, setNotice] = useState(opening ?? '');
  /** 재설정 메일을 보낸 주소. 보내고 나면 안내 화면으로 바뀐다. */
  const [sentTo, setSentTo] = useState('');
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
      } else if (mode === 'forgot') {
        await store.requestPasswordReset(email);
        setSentTo(email.trim());
      } else if (mode === 'reset') {
        await store.resetPassword({ token: resetToken ?? '', newPassword: password });
        // 쓴 토큰을 주소에서 지운다. 새로고침이 같은 토큰을 다시 던지면
        // "만료되었습니다" 가 떠서, 방금 성공한 사람이 실패한 줄 안다.
        try {
          history.replaceState(null, '', location.pathname);
        } catch { /* 주소를 못 바꿔도 흐름은 이어진다 */ }
        // 재설정은 로그인시키지 않는다. 새 비밀번호로 다시 들어와야 한다.
        setPassword('');
        setNotice('비밀번호를 바꿨습니다. 새 비밀번호로 들어와 주세요.');
        setMode('signin');
      } else {
        await store.signIn({ email, password });
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: Mode) => {
    setMode(m); setError(''); setPendingEmail(''); setSentTo(''); setNotice('');
  };

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

  if (sentTo) {
    return (
      <div className="auth">
        <div className="auth-card">
          <div className="auth-mark display">OLRW</div>
          <h1 className="auth-title display">메일함을<br />확인해 주세요</h1>
          <p className="auth-sub">
            <b>{sentTo}</b> 으로 비밀번호를 다시 정하는 링크를 보냈습니다.<br />
            링크를 누르면 새 비밀번호를 정하는 화면이 열립니다.
          </p>
          {/* 그 주소로 가입한 적이 없어도 같은 화면을 보여준다 — 여기서 알려 주면
              누구나 이메일을 넣어 보며 가입 여부를 캘 수 있다. */}
          <p className="auth-hint">
            메일이 오지 않으면 스팸함을 확인해 주세요.<br />
            가입한 적 없는 주소로는 메일이 가지 않습니다.
          </p>
          <button type="button" className="auth-submit" onClick={() => switchTo('signin')}>
            로그인 화면으로
          </button>
          {onBack && <button type="button" className="auth-back auth-back-bottom" onClick={onBack}>← 돌아가기</button>}
        </div>
      </div>
    );
  }

  const forgot = mode === 'forgot';
  const reset = mode === 'reset';
  const alone = forgot || reset;   // 탭 없이 한 가지 일만 하는 화면

  return (
    <div className="auth">
      <div className="auth-card">
        {onBack && (
          <button type="button" className="auth-back" onClick={onBack}>← 돌아가기</button>
        )}
        <div className="auth-mark display">OLRW</div>
        <h1 className="auth-title display">Our love,<br />rightly written</h1>
        <p className="auth-sub">
          {forgot ? '가입한 이메일을 넣으면 다시 정하는 링크를 보냅니다.'
            : reset ? '새 비밀번호를 정합니다.'
            : mode === 'signup' ? '계정을 만들어 전보함을 시작하세요.'
            : '로그인하고 이어서 전보를 나눕니다.'}
        </p>

        {!alone && (
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signin'}
              className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
              onClick={() => switchTo('signin')}>로그인</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'}
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => switchTo('signup')}>가입</button>
          </div>
        )}

        <form className="auth-form" onSubmit={submit}>
          {notice && <p className="auth-notice">{notice}</p>}

          {mode === 'signup' && (
            <label className="auth-field">
              <span className="auth-label">표시 이름</span>
              <input className="auth-input" type="text" value={displayName} maxLength={12}
                autoComplete="nickname" placeholder="전보함에서 보일 이름"
                onChange={(e) => setDisplayName(e.target.value)} />
            </label>
          )}
          {/* 재설정 화면에는 이메일 칸이 없다. 누구인지는 토큰이 안다. */}
          {!reset && (
            <label className="auth-field">
              <span className="auth-label">이메일</span>
              <input className="auth-input" type="email" value={email} required
                autoComplete="email" inputMode="email" placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {!forgot && (
            <label className="auth-field">
              <span className="auth-label">{reset ? '새 비밀번호' : '비밀번호'}</span>
              {/* 서버(Better Auth)가 요구하는 최소는 8자다. 6으로 두면 브라우저는
                  통과시키고 서버가 막아, 사용자는 왜 막혔는지 모른 채 서 있게 된다. */}
              <input className="auth-input" type="password" value={password} required minLength={8}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="8자 이상"
                onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button className="auth-submit" type="submit" disabled={busy}>
            {busy
              ? (mode === 'signup' ? '만드는 중…' : forgot ? '보내는 중…' : reset ? '바꾸는 중…' : '들어가는 중…')
              : (mode === 'signup' ? '계정 만들기' : forgot ? '재설정 메일 보내기' : reset ? '비밀번호 바꾸기' : '로그인')}
          </button>

          {/* 비밀번호를 모르면 어느 문도 안 열린다. 그 길을 여기서 연다. */}
          {mode === 'signin' && (
            <button type="button" className="auth-forgot" onClick={() => switchTo('forgot')}>
              비밀번호를 잊으셨나요
            </button>
          )}
          {alone && (
            <button type="button" className="auth-forgot" onClick={() => switchTo('signin')}>
              로그인으로 돌아가기
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
