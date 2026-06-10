export function LoginScreen({
  role,
  email,
  password,
  error,
  isSubmitting,
  onRoleChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}) {
  return (
    <main className="phone-screen login-screen" aria-labelledby="login-title">
      <section className="login-hero">
        <p className="eyebrow">LG Able Band</p>
        <h1 id="login-title">Able Band 로그인</h1>
        <p className="hero-copy">역할을 선택하고 오늘의 안전 상태를 확인하세요.</p>
      </section>

      <form className="login-panel" onSubmit={onSubmit}>
        <fieldset className="role-group">
          <legend>로그인 역할</legend>
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
            placeholder="user@example.com"
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            placeholder="password1234"
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </main>
  )
}
