import { useLayoutEffect, useState } from 'react'
import './App.css'
import { GuardianPlaceholder } from './components/GuardianPlaceholder'
import { HomeScreen } from './components/HomeScreen'
import { LoginScreen } from './components/LoginScreen'
import { SignupScreen } from './components/SignupScreen'
import { getStoredSession, login, logout, signup } from './services/authService'
import { startChatbotWakeService, stopChatbotWakeService } from './services/chatbotWakeService'
import { unlockTurnCueAudio } from './services/turnCueAudioService'
import { AUTHENTICATION_EXPIRED_EVENT } from './services/apiClient'
import {
  getDefaultAccessibilitySettings,
  storeAccessibilitySettings,
} from './utils/accessibilitySettings'

let speechSynthesisPrimed = false

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

function createInitialSession() {
  return getStoredSession()
}

function createInitialScreen(session) {
  if (!session) {
    return 'login'
  }

  return session.role === 'USER' ? 'userHome' : 'guardianHome'
}

function App() {
  const initialSession = createInitialSession()
  const [session, setSession] = useState(initialSession)
  const [screen, setScreen] = useState(() => createInitialScreen(initialSession))
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

  useLayoutEffect(() => {
    function handleAuthenticationExpired() {
      stopChatbotWakeService()
      logout()
      setSession(null)
      setScreen('login')
      setLoginForm((current) => ({ ...current, password: '' }))
      setLoginState({
        submitting: false,
        error: '로그인 세션이 만료되었습니다. 다시 로그인해주세요.',
        message: '',
      })
    }

    window.addEventListener(AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired)
    return () => {
      window.removeEventListener(AUTHENTICATION_EXPIRED_EVENT, handleAuthenticationExpired)
    }
  }, [])

  useLayoutEffect(() => {
    if (session?.role === 'USER') {
      startChatbotWakeService()
    }
  }, [session])

  useLayoutEffect(() => {
    if (session?.role !== 'USER') {
      return undefined
    }

    function unlockMobileAudio() {
      unlockTurnCueAudio()
      primeSpeechSynthesisForMobile({ speakSilent: true })
    }

    window.addEventListener('pointerdown', unlockMobileAudio, { passive: true, capture: true })
    window.addEventListener('touchstart', unlockMobileAudio, { passive: true, capture: true })
    window.addEventListener('click', unlockMobileAudio, { passive: true, capture: true })
    window.addEventListener('keydown', unlockMobileAudio, { passive: true, capture: true })

    return () => {
      window.removeEventListener('pointerdown', unlockMobileAudio, { capture: true })
      window.removeEventListener('touchstart', unlockMobileAudio, { capture: true })
      window.removeEventListener('click', unlockMobileAudio, { capture: true })
      window.removeEventListener('keydown', unlockMobileAudio, { capture: true })
    }
  }, [session])

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
    if (loginForm.role === 'USER') {
      primeSpeechSynthesisForMobile()
      unlockTurnCueAudio()
      startChatbotWakeService()
    }

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
    stopChatbotWakeService()
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

function primeSpeechSynthesisForMobile(options = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return
  }

  try {
    window.speechSynthesis.resume?.()
    window.speechSynthesis.getVoices?.()

    if (options.speakSilent && !speechSynthesisPrimed && 'SpeechSynthesisUtterance' in window) {
      speechSynthesisPrimed = true
      const utterance = new SpeechSynthesisUtterance(' ')
      utterance.lang = 'ko-KR'
      utterance.volume = 0.01
      utterance.rate = 1
      utterance.pitch = 1
      utterance.onend = () => {
        window.speechSynthesis.resume?.()
      }
      utterance.onerror = () => {
        window.speechSynthesis.resume?.()
      }
      window.speechSynthesis.speak(utterance)
    }
  } catch {
    // Some mobile browsers reject warm-up speech; regular chatbot speech still retries later.
  }
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
