import { useEffect, useMemo, useState } from 'react'
import { LivingSignalSettingsScreen } from '../features/living-signal'
import { getAppPreview, getHomeSummary } from '../services/homeService'
import { createEmergencyRequest } from '../services/emergencyService'
import { AlertsTab } from './AlertsTab'
import { DevicesTab } from './DevicesTab'
import { HomeTab } from './HomeTab'
import { VoiceChatbot } from './VoiceChatbot'

const statusLabels = {
  SAFE: '안전',
  CAUTION: '주의',
  DANGER: '위험',
  EMERGENCY: '긴급',
}

const tabs = [
  { id: 'home', label: '홈' },
  { id: 'alerts', label: '알림' },
  { id: 'devices', label: '기기' },
  { id: 'menu', label: '메뉴' },
]

const tabTitles = {
  home: 'Able Band 홈',
  alerts: '실시간 알림',
  devices: '기기와 UWB',
  menu: '메뉴',
}

const MAX_DEVICE_COUNT = 10

export function HomeScreen({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('home')
  const [menuScreen, setMenuScreen] = useState('root')
  const [emergencyMessage, setEmergencyMessage] = useState('')
  const [emergencySubmitting, setEmergencySubmitting] = useState(false)
  const [homeState, setHomeState] = useState({
    loading: true,
    error: '',
    summary: null,
    preview: null,
  })

  useEffect(() => {
    let isMounted = true

    async function loadHome() {
      try {
        const [summary, preview] = await Promise.all([getHomeSummary(), getAppPreview()])

        if (isMounted) {
          setHomeState({ loading: false, error: '', summary, preview })
        }
      } catch {
        if (isMounted) {
          setHomeState({
            loading: false,
            error: '홈 정보를 불러오지 못했습니다.',
            summary: null,
            preview: null,
          })
        }
      }
    }

    loadHome()

    return () => {
      isMounted = false
    }
  }, [])

  const currentTitle = useMemo(() => {
    if (activeTab === 'menu' && menuScreen === 'livingSignals') {
      return '생활 신호 설정'
    }

    return tabTitles[activeTab]
  }, [activeTab, menuScreen])

  function handleTabChange(nextTab) {
    setActiveTab(nextTab)
    setEmergencyMessage('')

    if (nextTab !== 'menu') {
      setMenuScreen('root')
    }
  }

  async function handleEmergencyRequest() {
    if (emergencySubmitting) {
      return
    }

    setEmergencySubmitting(true)
    setEmergencyMessage('긴급 요청을 보내는 중입니다.')
    try {
      const request = await createEmergencyRequest()
      setEmergencyMessage(request.message || '보호자에게 긴급 요청을 보냈습니다.')
    } catch (error) {
      setEmergencyMessage(error.message || '긴급 요청을 보내지 못했습니다.')
    } finally {
      setEmergencySubmitting(false)
    }
  }

  if (homeState.loading) {
    return (
      <main className="phone-screen home-screen app-screen home-loading-screen">
        <div className="home-loading-group" role="status">
          <img
            className="home-loading-logo"
            src="/LG_Able_Band_wordmark_transparent.png"
            alt="LG Able Band"
          />
          <p>홈 정보를 불러오는 중입니다.</p>
        </div>
      </main>
    )
  }

  if (homeState.error) {
    return (
      <main className="phone-screen home-screen app-screen">
        <p className="form-error" role="alert">
          {homeState.error}
        </p>
      </main>
    )
  }

  const { preview, summary } = homeState
  const statusLabel = statusLabels[summary.safetyStatus.level] || summary.safetyStatus.level
  const homeUserName = summary.user?.name || session.account.name
  const displayTitle = activeTab === 'home' ? `${homeUserName} 홈` : currentTitle
  const todayMessage = `${homeUserName}님, ${summary.safetyStatus.message}`

  return (
    <main className="phone-screen home-screen app-screen" aria-labelledby="home-title">
      <header className="home-header app-header">
        <div>
          <p className="eyebrow">LG Able Band</p>
          <h1 id="home-title">{displayTitle}</h1>
          {activeTab === 'home' ? <p className="header-summary">{todayMessage}</p> : null}
        </div>
        <button className="logout-button" type="button" onClick={onLogout}>
          로그아웃
        </button>
      </header>

      <div className="app-content">
        {activeTab === 'home' ? (
          <HomeTab
            emergencyMessage={emergencyMessage}
            emergencySubmitting={emergencySubmitting}
            statusLabel={statusLabel}
            summary={summary}
            onEmergencyRequest={handleEmergencyRequest}
            onOpenAlerts={() => handleTabChange('alerts')}
            onOpenDevices={() => handleTabChange('devices')}
          />
        ) : null}
        {activeTab === 'alerts' ? (
          <AlertsTab
            accessibilityType={session.userProfile?.accessibilityType || 'VISUAL'}
            alerts={preview.alerts}
          />
        ) : null}
        {activeTab === 'devices' ? (
          <DevicesTab
            devices={preview.devices}
            maxDeviceCount={MAX_DEVICE_COUNT}
            uwb={preview.uwb}
          />
        ) : null}
        {activeTab === 'menu' && menuScreen === 'root' ? (
          <MenuTab
            accessibility={preview.accessibility}
            guardian={preview.guardian}
            livingSignals={preview.livingSignals}
            onOpenLivingSignals={() => setMenuScreen('livingSignals')}
            onLogout={onLogout}
            userName={session.account.name}
          />
        ) : null}
        {activeTab === 'menu' && menuScreen === 'livingSignals' ? (
          <LivingSignalSettingsScreen
            livingSignals={preview.livingSignals}
            onBack={() => setMenuScreen('root')}
          />
        ) : null}
      </div>

      <nav className="bottom-tabs" aria-label="주요 메뉴">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? 'tab-button active' : 'tab-button'}
            type="button"
            key={tab.id}
            aria-label={tab.label}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <VoiceChatbot preview={preview} session={session} summary={summary} />
    </main>
  )
}

function MenuTab({
  accessibility,
  guardian,
  livingSignals,
  onOpenLivingSignals,
  onLogout,
  userName,
}) {
  return (
    <section className="tab-stack" aria-labelledby="menu-title">
      <div className="content-card hero-card">
        <p className="card-label">빠른 설정</p>
        <h2 id="menu-title">자주 바꾸는 설정만 모았어요.</h2>
        <p>{userName}님의 접근성, 보호자, 생활 신호 기능을 확인합니다.</p>
      </div>

      <section className="content-card">
        <div className="section-title-row">
          <h2>접근성 설정</h2>
          <span>{accessibility.textSize}</span>
        </div>
        <div className="settings-grid">
          <span>{accessibility.disabilityType}</span>
          <span>{accessibility.voiceGuide ? '음성 안내 ON' : '음성 안내 OFF'}</span>
          <span>{accessibility.vibrationGuide ? '진동 안내 ON' : '진동 안내 OFF'}</span>
          <span>{accessibility.highContrast ? '고대비 ON' : '고대비 OFF'}</span>
        </div>
      </section>

      <section className="soft-card guardian-card">
        <p className="card-label">보호자 연결</p>
        <h2>{guardian.name} 연결됨</h2>
        <p>
          {guardian.relation} · {guardian.status}
        </p>
      </section>

      <button className="soft-card settings-link-card" type="button" onClick={onOpenLivingSignals}>
        <p className="card-label">생활 신호 설정</p>
        <h2>등록된 생활 알림음을 관리해요.</h2>
        <p>
          현재 {livingSignals.summary.registeredSoundCount}개 신호, 샘플{' '}
          {livingSignals.summary.enrolledClipCount}개가 등록되어 있어요.
        </p>
      </button>

      <button className="secondary-button full-button" type="button" onClick={onLogout}>
        로그인으로 돌아가기
      </button>
    </section>
  )
}
