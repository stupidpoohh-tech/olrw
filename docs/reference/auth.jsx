// ============================================
// AuthScreen — Sign up / Sign in (Email + Password)
// ============================================

function AuthScreen({ store }) {
  const [mode, setMode] = React.useState('signin'); // 'signin' | 'signup'
  const [email, setEmail]       = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setName]  = React.useState('');
  const [error, setError]       = React.useState('');
  const [busy, setBusy]         = React.useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') await store.signUp({ email, password, displayName });
      else                   await store.signIn({ email, password });
    } catch (err) {
      setError(err.message || '문제가 생겼어요.');
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => {
    setMode('signin');
    setEmail('demo@olrw');
    setPassword('demo');
    setError('');
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-mark">OLRW</div>
        <h1 className="auth-title">Our love,<br/>rightly written</h1>
        <div className="auth-sub">
          {mode === 'signup' ? '계정을 만들어 전보함을 시작하세요.' : '로그인하고 이어서 전보를 나눠요.'}
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => { setMode('signin'); setError(''); }}
          >로그인</button>
          <button
            type="button"
            className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => { setMode('signup'); setError(''); }}
          >가입</button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="auth-field">
              <span className="auth-label">표시이름</span>
              <input
                className="auth-input"
                type="text"
                value={displayName}
                onChange={(e) => setName(e.target.value)}
                placeholder="상대에게 보일 이름"
                maxLength={12}
                autoComplete="nickname"
              />
            </label>
          )}
          <label className="auth-field">
            <span className="auth-label">이메일</span>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">비밀번호</span>
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {mode === 'signup' ? '가입하고 시작' : '로그인'}
          </button>
        </form>

        <div className="auth-foot">
          <button type="button" className="auth-link" onClick={fillDemo}>
            데모 계정으로 둘러보기
          </button>
          <div className="auth-foot-hint">demo@olrw · partner@olrw · friend@olrw · pw: demo</div>
        </div>
      </div>
    </div>
  );
}

window.AuthScreen = AuthScreen;
