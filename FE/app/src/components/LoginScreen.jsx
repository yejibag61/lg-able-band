export function LoginScreen({
  role,
  email,
  password,
  error,
  message,
  messageTone = 'success',
  isSubmitting,
  onRoleChange,
  onEmailChange,
  onPasswordChange,
  onSignupClick,
  onSubmit,
}) {
  const visuallyHiddenStyle = {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
    border: 0,
  }

  return (
    <main className="phone-screen login-screen app-screen" aria-labelledby="login-title">
      <h1 id="login-title" style={visuallyHiddenStyle}>
        Able Band 로그인
      </h1>
      <section className="login-hero" aria-label="브랜드">
        <img
          className="login-brand-logo"
          src="/LG_Able_Band_wordmark_transparent.png"
          alt="LG Able Band"
        />
      </section>
      <form className="login-panel" onSubmit={onSubmit}>
        <fieldset className="role-group">
          <legend style={visuallyHiddenStyle}>로그인 역할</legend>
          <label className={role === 'USER' ? 'role-card selected' : 'role-card'}>
            <input
              type="radio"
              name="role"
              value="USER"
              checked={role === 'USER'}
              onChange={() => onRoleChange('USER')}
            />
            <span>사용자</span>
          </label>
          <label className={role === 'GUARDIAN' ? 'role-card selected' : 'role-card'}>
            <input
              type="radio"
              name="role"
              value="GUARDIAN"
              checked={role === 'GUARDIAN'}
              onChange={() => onRoleChange('GUARDIAN')}
            />
            <span>보호자</span>
          </label>
        </fieldset>

        <label className="field">
          <span>이메일</span>
          <input
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="이메일을 입력해주세요"
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="비밀번호를 입력해주세요"
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {message ? (
          <p
            className={
              messageTone === 'notice'
                ? 'status-message status-message-notice'
                : 'status-message'
            }
            role="status"
          >
            {message}
          </p>
        ) : null}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '로그인 중..' : '로그인'}
        </button>
        <button className="secondary-button" type="button" onClick={onSignupClick}>
          회원가입
        </button>
      </form>
    </main>
  )
}
