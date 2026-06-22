export function SignupScreen({
  form,
  errors,
  isSubmitting,
  onChange,
  onSubmit,
  onBackToLogin,
}) {
  const isUser = form.role === 'USER'

  return (
    <main className="phone-screen signup-screen app-screen" aria-labelledby="signup-title">
      <section className="login-hero">
        <img
          className="signup-brand-logo"
          src="/LG_Able_Band_wordmark_transparent.png"
          alt="LG Able Band"
        />
        <h1 id="signup-title">Sign up</h1>
      </section>

      <form className="login-panel signup-panel" onSubmit={onSubmit} noValidate>
        <fieldset className="role-group">
          <legend>가입 역할</legend>
          <label className={isUser ? 'role-card selected' : 'role-card'}>
            <input
              type="radio"
              name="signup-role"
              value="USER"
              checked={isUser}
              onChange={() => onChange('role', 'USER')}
            />
            <span>사용자</span>
          </label>
          <label className={!isUser ? 'role-card selected' : 'role-card'}>
            <input
              type="radio"
              name="signup-role"
              value="GUARDIAN"
              checked={!isUser}
              onChange={() => onChange('role', 'GUARDIAN')}
            />
            <span>보호자</span>
          </label>
        </fieldset>

        <label className="field">
          <span>이름</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => onChange('name', event.target.value)}
            placeholder="이름을 입력해주세요"
            autoComplete="name"
          />
        </label>

        <label className="field">
          <span>이메일</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => onChange('email', event.target.value)}
            placeholder="user@example.com"
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span>비밀번호</span>
          <input
            type="password"
            value={form.password}
            onChange={(event) => onChange('password', event.target.value)}
            placeholder="영문+숫자 8자 이상"
            autoComplete="new-password"
          />
        </label>

        <label className="field">
          <span>비밀번호 확인</span>
          <input
            type="password"
            value={form.passwordConfirm}
            onChange={(event) => onChange('passwordConfirm', event.target.value)}
            placeholder="비밀번호를 다시 입력해 주세요"
            autoComplete="new-password"
          />
        </label>

        {isUser ? (
          <>
            <fieldset className="role-group compact-group">
              <legend>장애 유형</legend>
              <label className={form.accessibilityType === 'VISUAL' ? 'role-card selected' : 'role-card'}>
                <input
                  type="radio"
                  name="accessibilityType"
                  value="VISUAL"
                  checked={form.accessibilityType === 'VISUAL'}
                  onChange={() => onChange('accessibilityType', 'VISUAL')}
                />
                <span>시각장애인</span>
              </label>
              <label className={form.accessibilityType === 'HEARING' ? 'role-card selected' : 'role-card'}>
                <input
                  type="radio"
                  name="accessibilityType"
                  value="HEARING"
                  checked={form.accessibilityType === 'HEARING'}
                  onChange={() => onChange('accessibilityType', 'HEARING')}
                />
                <span>청각장애인</span>
              </label>
            </fieldset>

            <div className="settings-grid" aria-label="알림 기본 설정">
              <label>
                <input
                  type="checkbox"
                  checked={form.voiceGuide}
                  onChange={(event) => onChange('voiceGuide', event.target.checked)}
                />
                음성 안내
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={form.vibrationGuide}
                  onChange={(event) => onChange('vibrationGuide', event.target.checked)}
                />
                진동 안내
              </label>
            
            </div>
          </>
        ) : (
          <>
            <label className="field">
              <span>연락처</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => onChange('phone', event.target.value)}
                placeholder="010-0000-0000"
                autoComplete="tel"
              />
            </label>

            <label className="field">
              <span>관계</span>
              <input
                type="text"
                value={form.relationship}
                onChange={(event) => onChange('relationship', event.target.value)}
                placeholder="가족"
              />
            </label>
          </>
        )}

        {errors.length > 0 ? (
          <div className="form-error" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '가입 중...' : '가입하기'}
        </button>
        <button className="secondary-button" type="button" onClick={onBackToLogin}>
          로그인으로 돌아가기
        </button>
      </form>
    </main>
  )
}
