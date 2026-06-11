import { useState } from 'react'
import './App.css'
import { GuardianPlaceholder } from './components/GuardianPlaceholder'
import { HomeScreen } from './components/HomeScreen'
import { LoginScreen } from './components/LoginScreen'
import { SignupScreen } from './components/SignupScreen'
import { login, logout, signup } from './services/authService'
import {
  getDefaultAccessibilitySettings,
  storeAccessibilitySettings,
} from './utils/accessibilitySettings'

function createInitialSignupForm() {
  return {
    role: 'USER',
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    accessibilityType: 'VISUAL',
    ...getDefaultAccessibilitySettings('VISUAL'),
    phone: '',
    relationship: '',
  }
}

function App() {
  const [screen, setScreen] = useState('login')
  const [session, setSession] = useState(null)
  const [loginForm, setLoginForm] = useState({
    role: 'USER',
    email: '',
    password: '',
  })
  const [loginState, setLoginState] = useState({
    submitting: false,
    error: '',
    message: '',
  })
  const [signupForm, setSignupForm] = useState(createInitialSignupForm)
  const [signupState, setSignupState] = useState({
    submitting: false,
    errors: [],
  })

  async function handleLoginSubmit(event) {
    event.preventDefault()

    if (!loginForm.email.trim() || !loginForm.password) {
      setLoginState({
        submitting: false,
        error: '이메일과 비밀번호를 모두 입력해주세요.',
        message: '',
      })
      return
    }

    setLoginState({ submitting: true, error: '', message: '' })

    try {
      const nextSession = await login(loginForm)
      setSession(nextSession)
      setScreen(nextSession.role === 'USER' ? 'userHome' : 'guardianHome')
      setLoginState({ submitting: false, error: '', message: '' })
    } catch (error) {
      setLoginState({
        submitting: false,
        error: error.message || '로그인에 실패했습니다.',
        message: '',
      })
    }
  }

  async function handleSignupSubmit(event) {
    event.preventDefault()

    const errors = validateSignup(signupForm)
    if (errors.length > 0) {
      setSignupState({ submitting: false, errors })
      return
    }

    setSignupState({ submitting: true, errors: [] })

    try {
      const account = await signup(signupForm)
      if (account.role === 'USER') {
        storeAccessibilitySettings(account.email, signupForm, account.accessibilityType)
      }
      setLoginForm({
        role: account.role,
        email: account.email,
        password: '',
      })
      setLoginState({
        submitting: false,
        error: '',
        message: '회원가입이 완료되었습니다. 로그인해주세요.',
      })
      setSignupForm(createInitialSignupForm())
      setSignupState({ submitting: false, errors: [] })
      setScreen('login')
    } catch (error) {
      setSignupState({
        submitting: false,
        errors: [error.message || '회원가입에 실패했습니다.'],
      })
    }
  }

  function handleSignupChange(field, value) {
    setSignupForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'accessibilityType' ? getDefaultAccessibilitySettings(value) : {}),
    }))
    setSignupState((current) => ({ ...current, errors: [] }))
  }

  function handleLogout() {
    logout()
    setSession(null)
    setScreen('login')
    setLoginForm((current) => ({ ...current, password: '' }))
  }

  function handleBackToLogin() {
    setScreen('login')
    setSignupForm(createInitialSignupForm())
    setSignupState({ submitting: false, errors: [] })
  }

  if (screen === 'userHome' && session) {
    return <HomeScreen session={session} onLogout={handleLogout} />
  }

  if (screen === 'guardianHome' && session) {
    return <GuardianPlaceholder account={session.account} onLogout={handleLogout} />
  }

  if (screen === 'signup') {
    return (
      <SignupScreen
        form={signupForm}
        errors={signupState.errors}
        isSubmitting={signupState.submitting}
        onChange={handleSignupChange}
        onSubmit={handleSignupSubmit}
        onBackToLogin={handleBackToLogin}
      />
    )
  }

  return (
    <LoginScreen
      role={loginForm.role}
      email={loginForm.email}
      password={loginForm.password}
      error={loginState.error}
      message={loginState.message}
      isSubmitting={loginState.submitting}
      onRoleChange={(role) => setLoginForm((current) => ({ ...current, role }))}
      onEmailChange={(email) => setLoginForm((current) => ({ ...current, email }))}
      onPasswordChange={(password) => setLoginForm((current) => ({ ...current, password }))}
      onSignupClick={() => setScreen('signup')}
      onSubmit={handleLoginSubmit}
    />
  )
}

function validateSignup(form) {
  const errors = []
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

  if (form.name.trim().length < 2) {
    errors.push('이름은 2자 이상 입력해주세요.')
  }

  if (!emailPattern.test(form.email.trim())) {
    errors.push('올바른 이메일 형식으로 입력해주세요.')
  }

  if (!passwordPattern.test(form.password)) {
    errors.push('비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.')
  }

  if (form.password !== form.passwordConfirm) {
    errors.push('비밀번호가 일치하지 않습니다.')
  }

  if (form.role === 'USER' && !['VISUAL', 'HEARING'].includes(form.accessibilityType)) {
    errors.push('장애 유형을 선택해주세요.')
  }

  if (form.role === 'GUARDIAN') {
    if (!form.phone.trim()) {
      errors.push('연락처를 입력해주세요.')
    }
    if (!form.relationship.trim()) {
      errors.push('관계를 입력해주세요.')
    }
  }

  return errors
}

export default App
