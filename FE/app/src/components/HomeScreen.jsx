import { useEffect, useMemo, useState } from 'react'
import { LivingSignalSettingsScreen } from '../features/living-signal'
import {
  getAccessibilitySettings,
  updateAccessibilitySettings,
} from '../services/accessibilityService'
import { getAppPreview, getHomeSummary } from '../services/homeService'
import { loadStoredAccessibilitySettings } from '../utils/accessibilitySettings'
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

const MAX_DEVICE_COUNT = 6

export function HomeScreen({ session, onLogout }) {
  const accessibilityType = session.userProfile?.accessibilityType || 'VISUAL'
  const accessibilityIdentity = session.account.email || session.userProfile?.userId
  const [activeTab, setActiveTab] = useState('home')
  const [menuScreen, setMenuScreen] = useState('root')
  const [accessibilitySettings, setAccessibilitySettings] = useState(() =>
    loadStoredAccessibilitySettings(accessibilityIdentity, accessibilityType),
  )
  const [accessibilityMessage, setAccessibilityMessage] = useState('')
  const [linkedGuardians, setLinkedGuardians] = useState([])
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
        const [summary, preview, savedAccessibilitySettings] = await Promise.all([
          getHomeSummary(),
          getAppPreview(),
          getAccessibilitySettings({
            accessibilityType,
            identity: accessibilityIdentity,
          }),
        ])

        if (isMounted) {
          setAccessibilitySettings(savedAccessibilitySettings)
          setHomeState({ loading: false, error: '', summary, preview })
          setLinkedGuardians((current) => (current.length > 0 || !preview.guardian ? current : [preview.guardian]))
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
  }, [accessibilityIdentity, accessibilityType])

  const currentTitle = useMemo(() => {
    if (activeTab === 'menu' && menuScreen === 'livingSignals') {
      return '생활 신호 설정'
    }

    if (activeTab === 'menu' && menuScreen === 'guardianConnection') {
      return '보호자 연결'
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

  async function handleAccessibilityChange(key, value) {
    const nextSettings = {
      ...accessibilitySettings,
      [key]: value,
    }

    setAccessibilitySettings(nextSettings)
    setAccessibilityMessage('설정을 저장하는 중입니다.')

    try {
      const savedSettings = await updateAccessibilitySettings({
        accessibilityType,
        identity: accessibilityIdentity,
        settings: nextSettings,
      })
      setAccessibilitySettings(savedSettings)
      setAccessibilityMessage('접근성 설정을 저장했습니다.')
    } catch {
      setAccessibilityMessage('서버에 연결하지 못해 이 기기에 설정을 저장했습니다.')
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

  const accessibilityClassName = [
    accessibilitySettings.highContrast ? 'high-contrast' : '',
    accessibilitySettings.largeText ? 'large-text' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main
      className={`phone-screen home-screen app-screen ${accessibilityClassName}`.trim()}
      aria-labelledby="home-title"
    >
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
            accessibilityType={accessibilityType}
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
            accessibilitySettings={accessibilitySettings}
            accessibilityType={accessibilityType}
            message={accessibilityMessage}
            onAccessibilityChange={handleAccessibilityChange}
            guardians={linkedGuardians}
            livingSignals={preview.livingSignals}
            onOpenGuardianConnection={() => setMenuScreen('guardianConnection')}
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
        {activeTab === 'menu' && menuScreen === 'guardianConnection' ? (
          <GuardianConnectionScreen
            guardians={linkedGuardians}
            onBack={() => setMenuScreen('root')}
            onSaveGuardian={(guardian) => {
              setLinkedGuardians((current) => [
                ...current.filter((item) => item.guardianId !== guardian.guardianId),
                guardian,
              ])
            }}
            onRemoveGuardian={(guardianId) => {
              setLinkedGuardians((current) => current.filter((item) => item.guardianId !== guardianId))
            }}
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
  accessibilitySettings,
  accessibilityType,
  message,
  onAccessibilityChange,
  guardians,
  livingSignals,
  onOpenGuardianConnection,
  onOpenLivingSignals,
  onLogout,
  userName,
}) {
  const [guardianInviteMessage, setGuardianInviteMessage] = useState('')
  const guardianMembers = [
    {
      id: 'me',
      label: '나',
      name: userName,
      tone: 'self',
    },
    ...guardians.map((member) => ({
      id: `guardian-${member.guardianId || member.name}`,
      label: member.relation || '가족',
      name: member.name,
      tone: 'guardian',
      status: member.status || member.connectionStatus || '연결됨',
    })),
  ]

  return (
    <section className="tab-stack" aria-labelledby="menu-title">
      <div className="content-card hero-card">
        <p className="card-label">빠른 설정</p>
        <h2 id="menu-title">자주 바꾸는 설정만 모았어요.</h2>
        <p>{userName}님의 접근성, 보호자, 생활 신호 기능을 확인합니다.</p>
      </div>

      <section className="content-card accessibility-summary-card">
        <div className="accessibility-card-header">
          <div>
            <p className="card-label">내게 맞는 빠른 설정</p>
            <h2>접근성 설정</h2>
          </div>
          <span className="accessibility-type-badge">
            {accessibilityType === 'HEARING' ? '청각장애인' : '시각장애인'}
          </span>
        </div>
        <p className="accessibility-quick-copy">필요한 기능을 누르면 바로 적용됩니다.</p>
        <div className="accessibility-quick-grid">
          <AccessibilityQuickToggle
            description="화면과 알림을 소리로 안내"
            label="음성 안내"
            symbol="A"
            enabled={accessibilitySettings.voiceGuide}
            onClick={() => onAccessibilityChange('voiceGuide', !accessibilitySettings.voiceGuide)}
          />
          <AccessibilityQuickToggle
            description="주요 알림을 진동으로 전달"
            label="진동 안내"
            symbol="V"
            enabled={accessibilitySettings.vibrationGuide}
            onClick={() =>
              onAccessibilityChange('vibrationGuide', !accessibilitySettings.vibrationGuide)
            }
          />
          <AccessibilityQuickToggle
            description="색상 대비를 더 선명하게"
            label="고대비"
            symbol="C"
            enabled={accessibilitySettings.highContrast}
            onClick={() => onAccessibilityChange('highContrast', !accessibilitySettings.highContrast)}
          />
          <AccessibilityQuickToggle
            description="주요 글씨를 더 크게 표시"
            label="큰 글씨"
            symbol="T"
            enabled={accessibilitySettings.largeText}
            onClick={() => onAccessibilityChange('largeText', !accessibilitySettings.largeText)}
          />
        </div>
        {message ? (
          <p className="accessibility-save-message" role="status">
            {message}
          </p>
        ) : null}
      </section>

      <section className="soft-card home-member-card" aria-labelledby="home-member-title">
        <div className="home-member-header">
          <div>
            <p className="card-label">보호자 연결</p>
            <h2 id="home-member-title">홈 멤버</h2>
            <p>{guardianMembers.length}명</p>
          </div>
          <button
            className="member-more-button"
            type="button"
            aria-label="홈 멤버 관리"
            onClick={onOpenGuardianConnection}
          >
            ›
          </button>
        </div>

        <div className="home-member-list" aria-label="홈 멤버 목록">
          <button
            className="home-member-item invite"
            type="button"
            onClick={onOpenGuardianConnection}
          >
            <span className="member-avatar invite-avatar" aria-hidden="true">
              +
            </span>
            <span>멤버 초대</span>
          </button>

          {guardianMembers.map((member) => (
            <button
              className="home-member-item"
              type="button"
              key={member.id}
              onClick={() =>
                setGuardianInviteMessage(
                  member.status ? `${member.name} · ${member.status}` : `${member.name} 계정입니다.`,
                )
              }
            >
              <span className={`member-avatar avatar-${member.tone}`} aria-hidden="true">
                {member.name.slice(0, 1)}
                {member.id === 'me' ? <small>집</small> : null}
              </span>
              <span>{member.label}</span>
            </button>
          ))}
        </div>

        {guardianInviteMessage ? (
          <p className="member-status-message" role="status">
            {guardianInviteMessage}
          </p>
        ) : null}
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

function AccessibilityQuickToggle({ description, enabled, label, onClick, symbol }) {
  return (
    <button
      className={enabled ? 'accessibility-quick-toggle active' : 'accessibility-quick-toggle'}
      type="button"
      aria-label={`${label} ${enabled ? '끄기' : '켜기'}`}
      aria-pressed={enabled}
      onClick={onClick}
    >
      <span className="accessibility-quick-icon" aria-hidden="true">
        {symbol}
      </span>
      <span className="accessibility-quick-text">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="accessibility-inline-switch" aria-hidden="true">
        <span />
      </span>
    </button>
  )
}

function GuardianConnectionScreen({ guardians, onBack, onSaveGuardian, onRemoveGuardian }) {
  const [form, setForm] = useState({
    name: '김보호',
    phone: '010-0000-0000',
    isPrimary: guardians.length === 0,
    notifyOnDanger: true,
  })
  const [message, setMessage] = useState('')

  function handleChange(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
    setMessage('')
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!form.name.trim() || !form.phone.trim()) {
      setMessage('이름과 연락처를 입력해주세요.')
      return
    }

    const guardian = {
      guardianId: Date.now(),
      name: form.name.trim(),
      phone: form.phone.trim(),
      relation: '가족',
      isPrimary: form.isPrimary,
      notifyOnDanger: form.notifyOnDanger,
      status: '연결됨',
      connectionStatus: 'CONNECTED',
    }

    onSaveGuardian(guardian)
    setMessage('보호자 연결을 저장했습니다.')
  }

  return (
    <section className="tab-stack guardian-connection-screen" aria-labelledby="guardian-connection-title">
      <button className="text-link-button" type="button" onClick={onBack}>
        메뉴로 돌아가기
      </button>

      <form className="content-card guardian-form-card" onSubmit={handleSubmit}>
        <p className="card-label">보호자 연결</p>
        <h2 id="guardian-connection-title">긴급 알림을 받을 보호자를 등록해요.</h2>

        <label className="field">
          <span>이름</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => handleChange('name', event.target.value)}
            placeholder="김보호"
          />
        </label>

        <label className="field">
          <span>연락처</span>
          <input
            type="tel"
            value={form.phone}
            onChange={(event) => handleChange('phone', event.target.value)}
            placeholder="010-0000-0000"
          />
        </label>

        <div className="guardian-option-grid">
          <label className="guardian-option-card">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(event) => handleChange('isPrimary', event.target.checked)}
            />
            <span>
              <strong>대표 보호자</strong>
              우선 연락
            </span>
          </label>
          <label className="guardian-option-card">
            <input
              type="checkbox"
              checked={form.notifyOnDanger}
              onChange={(event) => handleChange('notifyOnDanger', event.target.checked)}
            />
            <span>
              <strong>위험 알림</strong>
              자동 전달
            </span>
          </label>
        </div>

        {message ? (
          <p className="member-status-message" role="status">
            {message}
          </p>
        ) : null}

        <button className="primary-button full-button" type="submit">
          보호자 등록
        </button>
      </form>

      <section className="content-card connected-guardian-card" aria-labelledby="connected-guardian-title">
        <div className="section-title-row">
          <h2 id="connected-guardian-title">연결된 보호자</h2>
          <span>{guardians.length}명</span>
        </div>

        {guardians.length > 0 ? (
          <div className="connected-guardian-list">
            {guardians.map((guardian) => (
              <article className="connected-guardian-item" key={guardian.guardianId || guardian.name}>
                <p>{guardian.isPrimary ? '대표 보호자' : guardian.relation || '보호자'}</p>
                <strong>{guardian.name}</strong>
                <span>{guardian.phone || '연락처 미등록'}</span>
                <div>
                  <span className="guardian-chip">연결됨</span>
                  {guardian.notifyOnDanger ? <span className="guardian-chip">긴급 알림 ON</span> : null}
                </div>
                <button
                  className="secondary-button full-button"
                  type="button"
                  onClick={() => {
                    onRemoveGuardian(guardian.guardianId)
                    setMessage(`${guardian.name} 보호자 연결을 해제했습니다.`)
                  }}
                >
                  연결 해제
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">아직 연결된 보호자가 없습니다.</p>
        )}
      </section>
    </section>
  )
}
