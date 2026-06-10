import { useState } from 'react'
import './App.css'
import { GuardianPlaceholder } from './components/GuardianPlaceholder'
import { HomeScreen } from './components/HomeScreen'
import { LoginScreen } from './components/LoginScreen'
import { login } from './services/authService'

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
  })

  async function handleLoginSubmit(event) {
    event.preventDefault()

    if (!loginForm.email.trim() || !loginForm.password) {
      setLoginState({
        submitting: false,
        error: '이메일과 비밀번호를 모두 입력해주세요.',
      })
      return
    }

    setLoginState({ submitting: true, error: '' })

    try {
      const nextSession = await login(loginForm)
      setSession(nextSession)
      setScreen(nextSession.role === 'USER' ? 'userHome' : 'guardianHome')
      setLoginState({ submitting: false, error: '' })
    } catch (error) {
      setLoginState({
        submitting: false,
        error: error.message || '로그인에 실패했습니다.',
      })
    }
  }

  function handleLogout() {
    setSession(null)
    setScreen('login')
    setLoginForm((current) => ({ ...current, password: '' }))
  }

  if (screen === 'userHome' && session) {
    return <HomeScreen session={session} onLogout={handleLogout} />
  }

  if (screen === 'guardianHome' && session) {
    return <GuardianPlaceholder account={session.account} onLogout={handleLogout} />
  }

  return (
    <LoginScreen
      role={loginForm.role}
      email={loginForm.email}
      password={loginForm.password}
      error={loginState.error}
      isSubmitting={loginState.submitting}
      onRoleChange={(role) => setLoginForm((current) => ({ ...current, role }))}
      onEmailChange={(email) => setLoginForm((current) => ({ ...current, email }))}
      onPasswordChange={(password) => setLoginForm((current) => ({ ...current, password }))}
      onSubmit={handleLoginSubmit}
    />
  )
}

export default App
