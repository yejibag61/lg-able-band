import jsQR from 'jsqr'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LivingSignalSettingsScreen } from '../features/living-signal'
import { getAccessibilitySettings, updateAccessibilitySettings } from '../services/accessibilityService'
import { getAppPreview, getHomeSummary } from '../services/homeService'
import { createEmergencyRequest } from '../services/emergencyService'
import {
  createGuardian,
  deleteGuardian,
  getGuardians,
  updateGuardian,
} from '../services/guardianService'
import { AlertsTab } from './AlertsTab'
import { DevicesTab } from './DevicesTab'
import { HomeTab } from './HomeTab'
import { CHATBOT_INTERRUPT_EVENT, VoiceChatbot } from './VoiceChatbot'
import { completeWearablePairing } from '../services/wearablePairingService'
import {
  getEmergencyAvailability,
  getSafetyStatusDisplay,
  mergeAlertStatusIntoHomeSummary,
  updateAlertsWithStatus,
} from '../utils/homeSummaryUtils'

function scrollAppContentToTop() {
  const appContent = document.querySelector('.app-content')
  if (appContent instanceof HTMLElement && typeof appContent.scrollTo === 'function') {
    appContent.scrollTo({ top: 0, left: 0 })
  }

  window.scrollTo({ top: 0, left: 0 })
}

const tabs = [
  { id: 'home', label: '홈' },
  { id: 'devices', label: '기기' },
  { id: 'alerts', label: '알림' },
  { id: 'menu', label: '설정' },
]

const tabTitles = {
  home: 'Able Band 홈',
  alerts: '실시간 알림',
  devices: '기기와 UWB',
  menu: '설정',
}

const MAX_DEVICE_COUNT = 6

const connectionStatusLabels = {
  CONNECTED: '연결됨',
  PENDING: '대기 중',
  DISCONNECTED: '연결 해제',
}

export function HomeScreen({ session, onLogout }) {
  const sessionEmail = session.account.email
  const sessionAccessibilityType = session.userProfile?.accessibilityType
  const [activeTab, setActiveTab] = useState('home')
  const [alertsScreen, setAlertsScreen] = useState('list')
  const [menuScreen, setMenuScreen] = useState('root')
  const [linkedGuardians, setLinkedGuardians] = useState([])
  const [guardianListState, setGuardianListState] = useState({
    loading: true,
    error: '',
  })
  const [emergencyMessage, setEmergencyMessage] = useState('')
  const [emergencySubmitting, setEmergencySubmitting] = useState(false)
  const [homeRefreshState, setHomeRefreshState] = useState({
    refreshing: false,
    error: '',
  })
  const [homeState, setHomeState] = useState({
    loading: true,
    error: '',
    summary: null,
    preview: null,
  })

  const loadHomeView = useCallback(async () => {
    const [summary, preview] = await Promise.all([getHomeSummary(), getAppPreview()])
    const accessibilityType = sessionAccessibilityType || summary.user?.accessibilityType || 'VISUAL'
    const accessibilitySettings = await getAccessibilitySettings({
      accessibilityType,
      identity: sessionEmail,
    })

    return {
      summary,
      preview: {
        ...preview,
        accessibility: createAccessibilityView(
          preview.accessibility,
          accessibilitySettings,
          accessibilityType,
        ),
      },
    }
  }, [sessionAccessibilityType, sessionEmail])

  useEffect(() => {
    let isMounted = true
    async function loadHome() {
      try {
        const nextHomeView = await loadHomeView()

        if (isMounted) {
          setHomeState({
            loading: false,
            error: '',
            ...nextHomeView,
          })
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
  }, [loadHomeView])

  useEffect(() => {
    let isMounted = true

    async function loadGuardians() {
      setGuardianListState({ loading: true, error: '' })
      try {
        const guardians = await getGuardians()
        if (isMounted) {
          setLinkedGuardians(guardians.map(normalizeGuardianForView))
          setGuardianListState({ loading: false, error: '' })
        }
      } catch (error) {
        if (isMounted) {
          setGuardianListState({
            loading: false,
            error: error.message || '보호자 목록을 불러오지 못했습니다.',
          })
        }
      }
    }

    loadGuardians()

    return () => {
      isMounted = false
    }
  }, [])

  const currentTitle = useMemo(() => {
    if (activeTab === 'menu' && menuScreen === 'livingSignals') {
      return '생활 신호 설정'
    }

    if (activeTab === 'menu' && menuScreen === 'guardianInvite') {
      return '보호자 초대'
    }

    if (activeTab === 'menu' && menuScreen === 'guardianManagement') {
      return '보호자 관리'
    }

    if (activeTab === 'menu' && menuScreen === 'wearablePairing') {
      return '웨어러블 연동'
    }

    return tabTitles[activeTab]
  }, [activeTab, menuScreen])

  useEffect(() => {
    const isMenuDetailScreen = activeTab === 'menu' && menuScreen !== 'root'
    const isAlertStatsScreen = activeTab === 'alerts' && alertsScreen === 'stats'

    if (!isMenuDetailScreen && !isAlertStatsScreen) {
      return
    }

    scrollAppContentToTop()
  }, [activeTab, alertsScreen, menuScreen])

  useEffect(() => {
    scrollAppContentToTop()
  }, [activeTab])

  function handleTabChange(nextTab) {
    window.dispatchEvent(new Event(CHATBOT_INTERRUPT_EVENT))
    setActiveTab(nextTab)
    setEmergencyMessage('')

    if (nextTab !== 'menu') {
      setMenuScreen('root')
    }

    if (nextTab !== 'alerts') {
      setAlertsScreen('list')
    }
  }

  async function handleEmergencyRequest(emergencyAvailability) {
    if (emergencySubmitting) {
      return
    }

    const availability = emergencyAvailability || getEmergencyAvailability(homeState.summary)
    if (!availability.canRequest) {
      setEmergencyMessage(availability.reason)
      return
    }

    setEmergencySubmitting(true)
    setEmergencyMessage('긴급 요청을 보내는 중입니다.')
    try {
      const request = await createEmergencyRequest()
      setEmergencyMessage(request.statusMessage || '보호자에게 긴급 요청을 보냈습니다.')
      const nextHomeView = await loadHomeView()
      setHomeState({ loading: false, error: '', ...nextHomeView })
    } catch (error) {
      setEmergencyMessage(error.message || '긴급 요청을 보내지 못했습니다.')
    } finally {
      setEmergencySubmitting(false)
    }
  }

  async function handleHomeRefresh() {
    if (homeRefreshState.refreshing) {
      return
    }

    setHomeRefreshState({ refreshing: true, error: '' })
    try {
      const nextHomeView = await loadHomeView()
      setHomeState({ loading: false, error: '', ...nextHomeView })
      setHomeRefreshState({ refreshing: false, error: '' })
    } catch (error) {
      setHomeRefreshState({
        refreshing: false,
        error: error.message || '홈 정보를 새로고침하지 못했습니다.',
      })
    }
  }

  function handleAlertStatusChange(alertId, status) {
    setHomeState((currentState) => {
      if (!currentState.summary || !currentState.preview) {
        return currentState
      }

      return {
        ...currentState,
        summary: mergeAlertStatusIntoHomeSummary(currentState.summary, alertId, status),
        preview: {
          ...currentState.preview,
          alerts: updateAlertsWithStatus(currentState.preview.alerts, alertId, status),
        },
      }
    })
  }

  async function handleAccessibilityChange(nextSettings) {
    const accessibilityType =
      sessionAccessibilityType || homeState.summary?.user?.accessibilityType || 'VISUAL'
    const savedSettings = await updateAccessibilitySettings({
      accessibilityType,
      identity: sessionEmail,
      settings: nextSettings,
    })

    setHomeState((currentState) => {
      if (!currentState.preview) {
        return currentState
      }

      return {
        ...currentState,
        preview: {
          ...currentState.preview,
          accessibility: createAccessibilityView(
            currentState.preview.accessibility,
            savedSettings,
            accessibilityType,
          ),
        },
      }
    })
  }

  async function handleCreateGuardian(form) {
    const guardian = normalizeGuardianForView(await createGuardian(form))
    setLinkedGuardians((current) => upsertGuardian(current, guardian))
    return guardian
  }

  async function handleUpdateGuardian(guardianId, updates) {
    const guardian = normalizeGuardianForView(await updateGuardian(guardianId, updates))
    setLinkedGuardians((current) => upsertGuardian(current, guardian))
    return guardian
  }

  async function handleDeleteGuardian(guardianId) {
    await deleteGuardian(guardianId)
    setLinkedGuardians((current) => current.filter((item) => item.guardianId !== guardianId))
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
          <p className="home-loading-message">
            홈화면으로 이동하는 중입니다
            <span className="home-loading-dots" aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </p>
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
  const statusDisplay = getSafetyStatusDisplay(summary.safetyStatus.level)
  const homeUserName = summary.user?.name || session.account.name
  const displayTitle = activeTab === 'home' ? `${homeUserName} 홈` : currentTitle

  return (
    <main className="phone-screen home-screen app-screen" aria-labelledby="home-title">
      <header className="home-header app-header">
        <div>
          <span className="home-brand-logo-frame" aria-hidden="true">
            <img
              className="home-brand-logo"
              src="/LG_Able_Band_wordmark_transparent.png"
              alt="LG Able Band"
            />
          </span>
          <div className={activeTab === 'alerts' ? 'app-title-with-icon' : undefined}>
            <h1 id="home-title">{displayTitle}</h1>
            {activeTab === 'alerts' ? (
              <button
                className={
                  alertsScreen === 'stats'
                    ? 'alert-header-stats-icon alert-header-stats-icon-selected'
                    : 'alert-header-stats-icon'
                }
                type="button"
                aria-label="알림 통계 보기"
                aria-pressed={alertsScreen === 'stats'}
                onClick={() => setAlertsScreen((current) => (current === 'stats' ? 'list' : 'stats'))}
              >
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M5 19V10" />
                  <path d="M12 19V5" />
                  <path d="M19 19v-7" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="app-content">
        {activeTab === 'home' ? (
          <HomeTab
            emergencyMessage={emergencyMessage}
            emergencySubmitting={emergencySubmitting}
            alerts={preview.alerts}
            refreshError={homeRefreshState.error}
            refreshing={homeRefreshState.refreshing}
            statusDisplay={statusDisplay}
            summary={summary}
            onEmergencyRequest={handleEmergencyRequest}
            onOpenAlerts={() => handleTabChange('alerts')}
            onRefreshHome={handleHomeRefresh}
          />
        ) : null}
        {activeTab === 'alerts' ? (
          <AlertsTab
            accessibilityType={session.userProfile?.accessibilityType || 'VISUAL'}
            alerts={preview.alerts}
            alertView={alertsScreen}
            onAlertStatusChange={handleAlertStatusChange}
            onCloseStats={() => setAlertsScreen('list')}
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
            guardians={linkedGuardians}
            livingSignals={preview.livingSignals}
            onAccessibilityChange={handleAccessibilityChange}
            onOpenGuardianInvite={() => setMenuScreen('guardianInvite')}
            onOpenGuardianManagement={() => setMenuScreen('guardianManagement')}
            onOpenLivingSignals={() => setMenuScreen('livingSignals')}
            onOpenWearablePairing={() => setMenuScreen('wearablePairing')}
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
        {activeTab === 'menu' && menuScreen === 'guardianInvite' ? (
          <GuardianInviteScreen
            guardians={linkedGuardians}
            guardianListState={guardianListState}
            onBack={() => setMenuScreen('root')}
            onCreateGuardian={handleCreateGuardian}
          />
        ) : null}
        {activeTab === 'menu' && menuScreen === 'guardianManagement' ? (
          <GuardianManagementScreen
            guardians={linkedGuardians}
            guardianListState={guardianListState}
            onBack={() => setMenuScreen('root')}
            onRemoveGuardian={handleDeleteGuardian}
            onUpdateGuardian={handleUpdateGuardian}
          />
        ) : null}
        {activeTab === 'menu' && menuScreen === 'wearablePairing' ? (
          <WearablePairingScannerScreen onBack={() => setMenuScreen('root')} />
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

function createAccessibilityView(currentAccessibility, settings, accessibilityType) {
  const largeText = Boolean(settings.largeText)

  return {
    ...currentAccessibility,
    ...settings,
    disabilityType: formatAccessibilityType(accessibilityType || currentAccessibility?.disabilityType),
    largeText,
    textSize: largeText ? '크게' : '기본',
  }
}

function formatAccessibilityType(value) {
  if (value === 'VISUAL') {
    return '시각장애'
  }

  if (value === 'HEARING') {
    return '청각장애'
  }

  return value || '지원 정보 없음'
}

const accessibilityToggleItems = [
  {
    key: 'voiceGuide',
    label: '음성 안내',
    icon: '음',
    description: '위험 알림과 주요 안내를 음성으로 들려줍니다.',
  },
  {
    key: 'vibrationGuide',
    label: '진동 안내',
    icon: '진',
    description: '밴드와 앱 알림을 진동 중심으로 전달합니다.',
  },
  {
    key: 'largeText',
    label: '큰 글씨',
    icon: 'Aa',
    description: '큰 글씨 안내 설정을 저장합니다.',
  },
  {
    key: 'highContrast',
    label: '고대비',
    icon: '대',
    description: '고대비 안내 설정을 저장합니다.',
  },
]

function MenuTab({
  accessibility,
  guardians,
  livingSignals,
  onAccessibilityChange,
  onOpenGuardianInvite,
  onOpenGuardianManagement,
  onOpenLivingSignals,
  onOpenWearablePairing,
  onLogout,
  userName,
}) {
  const [guardianInviteMessage, setGuardianInviteMessageState] = useState('')
  const [accessibilityMessage, setAccessibilityMessage] = useState('')
  const [accessibilitySavingKey, setAccessibilitySavingKey] = useState('')
  function setGuardianInviteMessage(nextMessage) {
    setGuardianInviteMessageState((currentMessage) =>
      currentMessage === nextMessage ? '' : nextMessage,
    )
  }
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
      status: formatConnectionStatus(member.connectionStatus || member.status),
    })),
  ]
  const accessibilitySettings = {
    voiceGuide: Boolean(accessibility.voiceGuide),
    vibrationGuide: Boolean(accessibility.vibrationGuide),
    highContrast: Boolean(accessibility.highContrast),
    largeText: Boolean(accessibility.largeText || accessibility.textSize === '크게'),
  }

  async function handleAccessibilityToggle(settingKey) {
    const nextSettings = {
      ...accessibilitySettings,
      [settingKey]: !accessibilitySettings[settingKey],
    }

    setAccessibilitySavingKey(settingKey)
    setAccessibilityMessage('접근성 설정을 저장하는 중입니다.')
    try {
      await onAccessibilityChange(nextSettings)
      setAccessibilityMessage('접근성 설정을 저장했습니다.')
    } catch (error) {
      setAccessibilityMessage(error.message || '접근성 설정을 저장하지 못했습니다.')
    } finally {
      setAccessibilitySavingKey('')
    }
  }

  return (
    <section className="tab-stack" aria-labelledby="menu-title">
      <section className="content-card accessibility-summary-card">
        <div className="accessibility-card-header" id="menu-title">
          <div>
            <p className="card-label">접근성 설정</p>
            <h2>알림과 화면 보조 설정</h2>
          </div>
          <span className="accessibility-type-badge">{accessibility.disabilityType}</span>
        </div>
        <p className="accessibility-quick-copy">
          필요한 안내 방식을 켜두면 알림과 위험 안내 설정으로 저장됩니다.
        </p>
        <div className="accessibility-quick-grid">
          {accessibilityToggleItems.map((item) => {
            const isActive = accessibilitySettings[item.key]
            const isSaving = accessibilitySavingKey === item.key
            return (
              <button
                className={isActive ? 'accessibility-quick-toggle active' : 'accessibility-quick-toggle'}
                type="button"
                key={item.key}
                aria-pressed={isActive}
                disabled={Boolean(accessibilitySavingKey)}
                onClick={() => handleAccessibilityToggle(item.key)}
              >
                <span className="accessibility-quick-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="accessibility-quick-text">
                  <strong>
                    {item.label} {isActive ? 'ON' : 'OFF'}
                  </strong>
                  <small>{isSaving ? '저장 중' : item.description}</small>
                </span>
                <span className="accessibility-inline-switch" aria-hidden="true">
                  <span />
                </span>
              </button>
            )
          })}
        </div>
        {accessibilityMessage ? (
          <p className="accessibility-save-message" role="status">
            {accessibilityMessage}
          </p>
        ) : null}
      </section>

      <section className="soft-card home-member-card" aria-labelledby="home-member-title">
        <div className="home-member-header">
          <div>
            <p className="card-label">보호자 연결</p>
            <strong className="card-title" id="home-member-title">홈 멤버</strong>
            <p>{guardianMembers.length}명</p>
          </div>
          <button
            className="device-inline-add-button guardian-manage-button"
            type="button"
            aria-label="홈 멤버 관리"
            onClick={onOpenGuardianManagement}
          >
            관리
          </button>
        </div>

        <div className="home-member-list" aria-label="홈 멤버 목록">
          <button
            className="home-member-item invite"
            type="button"
            onClick={onOpenGuardianInvite}
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

      <button className="soft-card wearable-pairing-card" type="button" onClick={onOpenWearablePairing}>
        <span>
          <p className="card-label">웨어러블 연동</p>
          <strong className="card-title">카메라로 밴드 QR코드 스캔</strong>
          <p>웨어러블 화면의 QR 코드를 비추면 연결을 시작합니다.</p>
        </span>
        <span className="wearable-pairing-icon" aria-hidden="true">
          QR
        </span>
      </button>

      <button className="soft-card settings-link-card" type="button" onClick={onOpenLivingSignals}>
        <p className="card-label">생활 신호 설정</p>
        <strong className="card-title">등록된 생활 알림음을 관리해요.</strong>
        <p>
          현재 {livingSignals.summary.registeredSoundCount}개 신호, 샘플{' '}
          {livingSignals.summary.enrolledClipCount}개가 등록되어 있어요.
        </p>
      </button>

      <button className="secondary-button full-button settings-logout-button" type="button" onClick={onLogout}>
        로그아웃
      </button>
    </section>
  )
}

function WearablePairingScannerScreen({ onBack }) {
  const [scannerMessage, setScannerMessage] = useState(
    '웨어러블 화면의 QR 코드를 프레임 안에 맞춰주세요.',
  )
  const [scanStatus, setScanStatus] = useState('ready')
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [detectedValue, setDetectedValue] = useState('')
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const scanFrameRef = useRef(null)
  const activeScanRef = useRef(false)

  function stopScanResources() {
    activeScanRef.current = false

    if (scanFrameRef.current) {
      window.cancelAnimationFrame(scanFrameRef.current)
      scanFrameRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setIsVideoReady(false)
  }

  useEffect(
    () => () => {
      stopScanResources()
    },
    [],
  )

  async function handleStartScan() {
    stopScanResources()
    setScanStatus('scanning')
    setIsVideoReady(false)
    setDetectedValue('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('이 환경에서는 카메라를 사용할 수 없어 스캔 화면만 표시합니다.')
      setScanStatus('blocked')
      return
    }

    try {
      const { stream } = await openCameraStream(videoRef.current)
      streamRef.current = stream

      const detector = window.BarcodeDetector
        ? new window.BarcodeDetector({ formats: ['qr_code'] })
        : null

      activeScanRef.current = true
      setIsVideoReady(true)
      setScannerMessage('카메라가 켜졌습니다. QR 코드를 프레임 안에 맞춰주세요.')
      scanQrFrame(detector)
    } catch (error) {
      setScannerMessage(
        error?.message || '카메라 권한이 필요합니다. 브라우저 권한을 허용한 뒤 다시 시도해주세요.',
      )
      setScanStatus('blocked')
    }
  }

  async function scanQrFrame(detector) {
    if (!activeScanRef.current || !videoRef.current || !canvasRef.current) {
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current

    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        setScannerMessage('카메라 화면을 읽을 수 없습니다. 다시 시도해주세요.')
        setScanStatus('blocked')
        stopScanResources()
        return
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        const codes = detector ? await detector.detect(canvas) : []
        const rawValue = codes[0]?.rawValue || decodeQrFromCanvas(context, canvas)

        if (rawValue && await handleQrDetected(rawValue)) {
          return
        }
      } catch {
        setScannerMessage('QR을 읽는 중 문제가 생겼습니다. 카메라를 다시 켜주세요.')
        setScanStatus('blocked')
        stopScanResources()
        return
      }
    }

    scanFrameRef.current = window.requestAnimationFrame(() => scanQrFrame(detector))
  }

  async function handleQrDetected(rawValue) {
    const pairing = parseWearablePairingPayload(rawValue)

    if (!pairing) {
      setScannerMessage(
        'Able Band 연동 QR이 아닙니다. 웨어러블 첫 화면의 QR을 다시 비춰주세요.',
      )
      return false
    }

    activeScanRef.current = false
    setScannerMessage(`${pairing.deviceName} ${pairing.pairingCode}를 인식했습니다. 웨어러블을 연동하고 있습니다.`)

    try {
      await completeWearablePairing(pairing)
      stopScanResources()
      setScanStatus('paired')
      setDetectedValue(rawValue)
      setScannerMessage(
        `${pairing.deviceName} ${pairing.pairingCode}를 인식했습니다. 웨어러블 연동이 완료되었습니다.`,
      )
      return true
    } catch (error) {
      stopScanResources()
      setScanStatus('blocked')
      setScannerMessage(error.message || '웨어러블 연동에 실패했습니다. QR을 새로 발급한 뒤 다시 스캔해주세요.')
      return true
    }
  }

  function handleStopScan() {
    stopScanResources()
    setScanStatus('ready')
    setScannerMessage('스캔을 중지했습니다. 다시 시작하려면 카메라를 켜주세요.')
  }

  return (
    <section className="tab-stack wearable-scanner-screen" aria-labelledby="wearable-scanner-title">
      <section className="content-card wearable-scanner-card">
        <div className="alert-detail-hero device-add-hero">
          <button
            className="text-button back-button alert-detail-back"
            type="button"
            aria-label="목록으로 돌아가기"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
          </button>
          <strong className="card-title" id="wearable-scanner-title">밴드 QR을 스캔해주세요.</strong>
        </div>
        <p>
          웨어러블의 첫 화면 또는 연동 화면에 표시된 QR 코드를 카메라로 비춰주세요.
        </p>

        <div className={`qr-scanner-preview scanner-${scanStatus}`} aria-label="QR 카메라 스캔 영역">
          <video
            ref={videoRef}
            className={isVideoReady ? 'scanner-video video-ready' : 'scanner-video'}
            muted
            playsInline
            aria-hidden="true"
          />
          <canvas ref={canvasRef} className="scanner-canvas" aria-hidden="true" />
          <div className="scanner-top-bar">
            <span>QR 스캔</span>
            <span>{scanStatus === 'paired' ? '연동 완료' : '대기 중'}</span>
          </div>
          <div className="scanner-frame" aria-hidden="true">
            <span className="scanner-corner corner-tl" />
            <span className="scanner-corner corner-tr" />
            <span className="scanner-corner corner-bl" />
            <span className="scanner-corner corner-br" />
          </div>
          <div className="scanner-bottom-bar">
            <span />
            <strong>QR을 프레임에 맞춰주세요.</strong>
            <span />
          </div>
        </div>

        <p className={scanStatus === 'blocked' ? 'member-status-message error' : 'member-status-message'} role="status">
          {scannerMessage}
        </p>

        {detectedValue ? (
          <p className="scanner-result">연동 정보: {formatPairingResult(detectedValue)}</p>
        ) : null}

        <div className="scanner-action-row">
          <button className="secondary-button compact-button" type="button" onClick={handleStartScan}>
            카메라 켜기
          </button>
          <button className="primary-button compact-button" type="button" onClick={handleStopScan}>
            카메라 끄기
          </button>
        </div>
      </section>
    </section>
  )
}

async function openCameraStream(video) {
  const constraintsCandidates = await getPreferredCameraConstraints()
  let lastError = null

  for (const constraints of constraintsCandidates) {
    let stream = null

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints)

      if (!video) {
        return { stream }
      }

      await attachVideoStream(video, stream)
      const hasVisibleFrame = await waitForVisibleVideoFrame(video)
      if (hasVisibleFrame) {
        return { stream }
      }

      stopMediaStream(stream)
      if (video) {
        video.srcObject = null
      }
    } catch (error) {
      lastError = error
      stopMediaStream(stream)
      if (video) {
        video.srcObject = null
      }
    }
  }

  throw lastError || new Error('카메라는 켜졌지만 화면이 들어오지 않습니다. 다른 앱에서 카메라를 사용 중인지 확인해주세요.')
}

async function getPreferredCameraConstraints() {
  const devices = await listVideoInputDevices()
  const physicalCameras = devices.filter((device) => !isVirtualCamera(device))
  const rearCamera = physicalCameras.find(isRearCamera)
  const frontCamera = physicalCameras.find(isFrontCamera)
  const fallbackPhysicalCamera = physicalCameras.find(
    (device) => device.deviceId !== rearCamera?.deviceId && device.deviceId !== frontCamera?.deviceId,
  )

  const candidates = [
    {
      video: {
        facingMode: { exact: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
  ]

  if (rearCamera?.deviceId) {
    candidates.unshift({
      video: {
        deviceId: {
          exact: rearCamera.deviceId,
        },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })
  }

  if (fallbackPhysicalCamera?.deviceId) {
    candidates.push({
      video: {
        deviceId: {
          exact: fallbackPhysicalCamera.deviceId,
        },
      },
    })
  }

  if (frontCamera?.deviceId) {
    candidates.push({
      video: {
        deviceId: {
          exact: frontCamera.deviceId,
        },
      },
    })
  }

  candidates.push({ video: true })

  return candidates
}

async function listVideoInputDevices() {
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.()
    return (devices || []).filter((device) => device.kind === 'videoinput')
  } catch {
    return []
  }
}

function isVirtualCamera(device) {
  return /virtual|obs|snap|xsplit|manycam|mirametrix/i.test(device.label || '')
}

function isRearCamera(device) {
  return /back|rear|environment|후면|뒤/i.test(device.label || '')
}

function isFrontCamera(device) {
  return /front|user|facetime|전면|앞/i.test(device.label || '')
}

async function attachVideoStream(video, stream) {
  video.srcObject = stream
  await video.play()
}

function waitForVisibleVideoFrame(video) {
  const timeoutMs = cameraFrameTimeoutMs()
  const startedAt = Date.now()

  return new Promise((resolve) => {
    function checkFrame() {
      if (video.videoWidth && video.videoHeight) {
        resolve(true)
        return
      }
      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false)
        return
      }
      window.requestAnimationFrame(checkFrame)
    }

    checkFrame()
  })
}

function cameraFrameTimeoutMs() {
  const override = Number(window.__ABLE_BAND_CAMERA_FRAME_TIMEOUT_MS__ || import.meta.env.VITE_CAMERA_FRAME_TIMEOUT_MS)
  return Number.isFinite(override) && override > 0 ? override : 1200
}

function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop())
}

function decodeQrFromCanvas(context, canvas) {
  try {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    if (typeof window.__ABLE_BAND_QR_DECODER__ === 'function') {
      return window.__ABLE_BAND_QR_DECODER__(imageData, canvas.width, canvas.height) || ''
    }
    return jsQR(imageData.data, imageData.width, imageData.height)?.data || ''
  } catch {
    return ''
  }
}

function parseWearablePairingPayload(rawValue) {
  try {
    const url = new URL(rawValue)
    const params = url.searchParams

    if (
      url.protocol !== 'lg-able-band:' ||
      url.hostname !== 'pair' ||
      params.get('source') !== 'wearable'
    ) {
      return null
    }

    const pairingSessionId = params.get('pairingSessionId')
    const deviceId = params.get('deviceId')
    const pairingCode = params.get('pairingCode')
    const nonce = params.get('nonce')

    if (!pairingSessionId || !deviceId || !pairingCode || !nonce) {
      return null
    }

    return {
      pairingSessionId,
      deviceId,
      pairingCode,
      nonce,
      deviceName: deviceId.includes('able-band') ? 'LG Able Band' : '웨어러블',
    }
  } catch {
    return null
  }
}

function formatPairingResult(rawValue) {
  const pairing = parseWearablePairingPayload(rawValue)

  if (!pairing) {
    return rawValue
  }

  return `${pairing.deviceName} · ${pairing.deviceId} · ${pairing.pairingCode}`
}

function GuardianInviteScreen({ guardians, guardianListState, onBack, onCreateGuardian }) {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    isPrimary: false,
    notifyOnDanger: true,
  })
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [toastKey, setToastKey] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const hasNoGuardians = !guardianListState.loading && guardians.length === 0
  const isPrimaryChecked = hasNoGuardians || form.isPrimary

  useEffect(() => {
    if (!message.text) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setMessage({ tone: '', text: '' })
    }, 2400)

    return () => window.clearTimeout(timeoutId)
  }, [message])

  function handleChange(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
    setMessage({ tone: '', text: '' })
  }

  function showMessage(tone, text) {
    setToastKey((current) => current + 1)
    setMessage({ tone, text })
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const name = form.name.trim()
    const phone = form.phone.trim()

    if (!name) {
      showMessage('error', '보호자 이름을 입력해 주세요.')
      return
    }

    if (!phone) {
      showMessage('error', '보호자 연락처를 입력해 주세요.')
      return
    }

    if (guardianListState.loading) {
      showMessage('error', '보호자 목록을 확인한 뒤 다시 시도해 주세요.')
      return
    }

    setSubmitting(true)
    try {
      const guardian = await onCreateGuardian({
        name,
        phone,
        isPrimary: isPrimaryChecked,
        notifyOnDanger: form.notifyOnDanger,
      })
      showMessage('success', `${guardian.name || '보호자'} 보호자를 등록했습니다.`)
      setForm((current) => ({
        ...current,
        name: '',
        phone: '',
        isPrimary: false,
      }))
    } catch (error) {
      showMessage('error', error.message || '보호자 등록을 저장하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="tab-stack guardian-connection-screen" aria-labelledby="guardian-invite-title">
      <form className="content-card guardian-form-card" onSubmit={handleSubmit}>
        <div className="guardian-form-hero device-add-hero">
          <button
            className="text-button back-button alert-detail-back"
            type="button"
            aria-label="메뉴로 돌아가기"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
          </button>
          <strong className="card-title" id="guardian-invite-title">
            보호자 초대
          </strong>
        </div>

        <label className="field">
          <span>보호자 이름</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => handleChange('name', event.target.value)}
            placeholder="예: 김보호"
            autoComplete="name"
          />
        </label>

        <label className="field">
          <span>보호자 연락처</span>
          <input
            type="tel"
            value={form.phone}
            onChange={(event) => handleChange('phone', event.target.value)}
            placeholder="010-0000-0000"
            autoComplete="tel"
          />
        </label>

        <div className="guardian-option-grid">
          <label className="guardian-option-card">
            <input
              type="checkbox"
              checked={isPrimaryChecked}
              disabled={hasNoGuardians || guardianListState.loading}
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

        {guardianListState.loading ? (
          <p className="member-status-message" role="status">
            보호자 목록을 확인하는 중입니다.
          </p>
        ) : null}

        {guardianListState.error ? (
          <p className="member-status-message error" role="alert">
            {guardianListState.error}
          </p>
        ) : null}

        <button
          className="primary-button full-button"
          type="submit"
          disabled={submitting || guardianListState.loading}
        >
          {submitting ? '등록 중...' : '보호자 등록'}
        </button>
      </form>

      {message.text ? (
        <GuardianToast key={toastKey} message={message} />
      ) : null}
    </section>
  )
}

function GuardianManagementScreen({
  guardians,
  guardianListState,
  onBack,
  onRemoveGuardian,
  onUpdateGuardian,
}) {
  const [drafts, setDrafts] = useState({})
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [toastKey, setToastKey] = useState(0)
  const [savingGuardianId, setSavingGuardianId] = useState(null)
  const [deletingGuardianId, setDeletingGuardianId] = useState(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null)

  useEffect(() => {
    if (!message.text) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setMessage({ tone: '', text: '' })
    }, 2400)

    return () => window.clearTimeout(timeoutId)
  }, [message])

  function showMessage(tone, text) {
    setToastKey((current) => current + 1)
    setMessage({ tone, text })
  }

  function updateDraft(guardian, field, value) {
    const guardianKey = getGuardianKey(guardian)
    setDrafts((current) => ({
      ...current,
      [guardianKey]: {
        ...createGuardianDraft(guardian),
        ...current[guardianKey],
        [field]: value,
      },
    }))
    setConfirmingDeleteId(null)
    setMessage({ tone: '', text: '' })
  }

  async function handleSaveGuardian(guardian, overrides = {}) {
    const guardianKey = getGuardianKey(guardian)
    const draft = {
      ...createGuardianDraft(guardian),
      ...drafts[guardianKey],
      ...overrides,
    }
    const name = draft.name.trim()
    const phone = draft.phone.trim()

    if (!name) {
      showMessage('error', '보호자 이름을 입력해 주세요.')
      return null
    }

    if (!phone) {
      showMessage('error', '보호자 연락처를 입력해 주세요.')
      return null
    }

    setSavingGuardianId(guardian.guardianId)
    setConfirmingDeleteId(null)
    setMessage({ tone: '', text: '' })
    try {
      const savedGuardian = await onUpdateGuardian(guardian.guardianId, {
        name,
        phone,
        isPrimary: Boolean(draft.isPrimary),
        notifyOnDanger: Boolean(draft.notifyOnDanger),
      })
      showMessage('success', `${savedGuardian.name || name} 보호자 정보를 저장했습니다.`)
      setDrafts((current) => {
        const nextDrafts = { ...current }
        delete nextDrafts[guardianKey]
        return nextDrafts
      })
      return savedGuardian
    } catch (error) {
      showMessage('error', error.message || '보호자 정보를 저장하지 못했습니다.')
      return null
    } finally {
      setSavingGuardianId(null)
    }
  }

  async function handleRemoveGuardian(guardian) {
    if (deletingGuardianId) {
      return
    }

    setDeletingGuardianId(guardian.guardianId)
    setMessage({ tone: '', text: '' })
    try {
      await onRemoveGuardian(guardian.guardianId)
      setDrafts((current) => {
        const nextDrafts = { ...current }
        delete nextDrafts[getGuardianKey(guardian)]
        return nextDrafts
      })
      setConfirmingDeleteId(null)
      showMessage('success', `${guardian.name} 보호자를 삭제했습니다.`)
    } catch (error) {
      showMessage('error', error.message || '보호자를 삭제하지 못했습니다.')
    } finally {
      setDeletingGuardianId(null)
    }
  }

  return (
    <section className="tab-stack guardian-connection-screen" aria-labelledby="guardian-management-title">
      <div className="section-title-row">
        <button
          className="text-button back-button alert-detail-back"
          type="button"
          aria-label="메뉴로 돌아가기"
          onClick={onBack}
        >
          <span aria-hidden="true">←</span>
        </button>
        <div>
          <p className="card-label">보호자 연결</p>
          <strong className="card-title" id="guardian-management-title">
            보호자 관리
          </strong>
        </div>
      </div>

      <section className="content-card connected-guardian-card" aria-labelledby="connected-guardian-title">
        <div className="section-title-row">
          <strong className="card-title" id="connected-guardian-title">등록된 보호자</strong>
          <span>{guardians.length}명</span>
        </div>

        {guardianListState.loading ? (
          <p className="empty-state" role="status">
            보호자 목록을 확인하는 중입니다.
          </p>
        ) : null}

        {guardianListState.error ? (
          <p className="member-status-message error" role="alert">
            {guardianListState.error}
          </p>
        ) : null}

        {guardians.length > 0 ? (
          <div className="connected-guardian-list">
            {guardians.map((guardian) => {
              const guardianKey = getGuardianKey(guardian)
              const draft = {
                ...createGuardianDraft(guardian),
                ...drafts[guardianKey],
              }
              const isSaving = savingGuardianId === guardian.guardianId
              const isDeleting = deletingGuardianId === guardian.guardianId
              const isConfirmingDelete = confirmingDeleteId === guardian.guardianId

              return (
                <article className="connected-guardian-item" key={guardianKey}>
                  <p>{guardian.isPrimary ? '대표 보호자' : guardian.relation || '보호자'}</p>
                  <strong>{guardian.name}</strong>
                  <span>{guardian.phone || '연락처 미등록'}</span>
                  <div>
                    <span className="guardian-chip">
                      {formatConnectionStatus(guardian.connectionStatus)}
                    </span>
                    {guardian.notifyOnDanger ? <span className="guardian-chip">긴급 알림 ON</span> : null}
                  </div>

                  <label className="field compact-field">
                    <span>이름 수정</span>
                    <input
                      type="text"
                      value={draft.name}
                      aria-label={`${guardian.name} 이름 수정`}
                      onChange={(event) => updateDraft(guardian, 'name', event.target.value)}
                    />
                  </label>
                  <label className="field compact-field">
                    <span>연락처 수정</span>
                    <input
                      type="tel"
                      value={draft.phone}
                      aria-label={`${guardian.name} 연락처 수정`}
                      onChange={(event) => updateDraft(guardian, 'phone', event.target.value)}
                    />
                  </label>

                  <div className="guardian-option-grid">
                    <label className="guardian-option-card">
                      <input
                        type="checkbox"
                        checked={draft.notifyOnDanger}
                        aria-label={`${guardian.name} 위험 알림 수신`}
                        disabled={isSaving || isDeleting}
                        onChange={(event) =>
                          handleSaveGuardian(guardian, {
                            notifyOnDanger: event.target.checked,
                          })
                        }
                      />
                      <span>
                        <strong>위험 알림 수신</strong>
                        위험 알림을 전달합니다.
                      </span>
                    </label>
                    {!guardian.isPrimary ? (
                      <button
                        className="secondary-button full-button"
                        type="button"
                        aria-label={`${guardian.name} 대표로 설정`}
                        disabled={isSaving || isDeleting}
                        onClick={() => handleSaveGuardian(guardian, { isPrimary: true })}
                      >
                        대표로 설정
                      </button>
                    ) : null}
                  </div>

                  <button
                    className="primary-button full-button"
                    type="button"
                    aria-label={`${guardian.name} 수정 저장`}
                    disabled={isSaving || isDeleting}
                    onClick={() => handleSaveGuardian(guardian)}
                  >
                    {isSaving ? '저장 중...' : '수정 저장'}
                  </button>
                  <button
                    className="secondary-button full-button"
                    type="button"
                    aria-label={
                      isConfirmingDelete ? `${guardian.name} 삭제 확인` : `${guardian.name} 삭제`
                    }
                    disabled={isSaving || isDeleting}
                    onClick={() => {
                      if (isConfirmingDelete) {
                        handleRemoveGuardian(guardian)
                        return
                      }

                      setConfirmingDeleteId(guardian.guardianId)
                      showMessage('error', `${guardian.name} 보호자를 삭제하려면 한 번 더 눌러주세요.`)
                    }}
                  >
                    {isDeleting ? '삭제 중...' : isConfirmingDelete ? '삭제 확인' : '삭제'}
                  </button>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="empty-state">아직 연결된 보호자가 없습니다.</p>
        )}
      </section>

      {message.text ? (
        <GuardianToast key={toastKey} message={message} />
      ) : null}
    </section>
  )
}

function GuardianToast({ message }) {
  return (
    <div
      className="device-toast guardian-toast"
      role={message.tone === 'error' ? 'alert' : 'status'}
      aria-live={message.tone === 'error' ? 'assertive' : 'polite'}
    >
      <p
        className={
          message.tone === 'error'
            ? 'device-toast-message guardian-toast-message guardian-toast-message-error'
            : 'device-toast-message guardian-toast-message'
        }
      >
        {message.text}
      </p>
    </div>
  )
}

function normalizeGuardianForView(guardian) {
  return {
    ...guardian,
    relation: guardian.relation || guardian.relationship || '가족',
    status: formatConnectionStatus(guardian.connectionStatus || guardian.status),
    connectionStatus: guardian.connectionStatus || guardian.status || 'CONNECTED',
  }
}

function getGuardianKey(guardian) {
  return String(guardian.guardianId || guardian.name || guardian.phone || 'guardian')
}

function createGuardianDraft(guardian) {
  return {
    name: guardian.name || '',
    phone: guardian.phone || '',
    isPrimary: Boolean(guardian.isPrimary),
    notifyOnDanger: Boolean(guardian.notifyOnDanger),
  }
}

function upsertGuardian(currentGuardians, guardian) {
  const withoutSameGuardian = currentGuardians.filter((item) => item.guardianId !== guardian.guardianId)
  const nextGuardians = guardian.isPrimary
    ? withoutSameGuardian.map((item) => ({ ...item, isPrimary: false }))
    : withoutSameGuardian

  return [...nextGuardians, guardian]
}

function formatConnectionStatus(status) {
  return connectionStatusLabels[status] || status || '연결됨'
}
