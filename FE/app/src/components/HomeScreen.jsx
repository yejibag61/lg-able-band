import { useEffect, useMemo, useRef, useState } from 'react'
import { LivingSignalSettingsScreen } from '../features/living-signal'
import { getAppPreview, getHomeSummary } from '../services/homeService'
import { createEmergencyRequest } from '../services/emergencyService'
import { deleteGuardian, getGuardians, linkGuardianByEmail } from '../services/guardianService'
import { AlertsTab } from './AlertsTab'
import { DevicesTab } from './DevicesTab'
import { HomeTab } from './HomeTab'
import { CHATBOT_INTERRUPT_EVENT, VoiceChatbot } from './VoiceChatbot'

function scrollAppContentToTop() {
  const appContent = document.querySelector('.app-content')
  if (appContent instanceof HTMLElement) {
    appContent.scrollTo({ top: 0, left: 0 })
  }

  window.scrollTo({ top: 0, left: 0 })
}

const statusDisplays = {
  SAFE: { label: '안전', emoji: '🙂' },
  CAUTION: { label: '주의', emoji: '😐' },
  DANGER: { label: '위험', emoji: '😟' },
  EMERGENCY: { label: '긴급', emoji: '😨' },
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

    if (activeTab === 'menu' && menuScreen === 'guardianConnection') {
      return '보호자 연결'
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

  async function handleLinkGuardian(form) {
    const guardian = normalizeGuardianForView(await linkGuardianByEmail(form))
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
  const statusDisplay = statusDisplays[summary.safetyStatus.level] || {
    label: summary.safetyStatus.level,
    emoji: '🙂',
  }
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
                className="alert-header-stats-icon"
                type="button"
                aria-label="알림 통계 보기"
                onClick={() => setAlertsScreen('stats')}
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
            statusDisplay={statusDisplay}
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
            alertView={alertsScreen}
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
            onOpenGuardianConnection={() => setMenuScreen('guardianConnection')}
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
        {activeTab === 'menu' && menuScreen === 'guardianConnection' ? (
          <GuardianConnectionScreen
            guardians={linkedGuardians}
            guardianListState={guardianListState}
            onBack={() => setMenuScreen('root')}
            onLinkGuardian={handleLinkGuardian}
            onRemoveGuardian={handleDeleteGuardian}
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

function MenuTab({
  accessibility,
  guardians,
  livingSignals,
  onOpenGuardianConnection,
  onOpenLivingSignals,
  onOpenWearablePairing,
  onLogout,
  userName,
}) {
  const [guardianInviteMessage, setGuardianInviteMessageState] = useState('')
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

  return (
    <section className="tab-stack" aria-labelledby="menu-title">
      <section className="content-card">
        <div className="section-title-row" id="menu-title">
          <strong className="card-title">접근성 설정</strong>
          <span>{accessibility.textSize}</span>
        </div>
        <div className="settings-grid">
          <span>{accessibility.disabilityType}</span>
          <span>{accessibility.voiceGuide ? '음성 안내 ON' : '음성 안내 OFF'}</span>
          <span>{accessibility.vibrationGuide ? '진동 안내 ON' : '진동 안내 OFF'}</span>
          <span>{accessibility.highContrast ? '고대비 ON' : '고대비 OFF'}</span>
        </div>
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
            onClick={onOpenGuardianConnection}
          >
            관리
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

      <button className="soft-card wearable-pairing-card" type="button" onClick={onOpenWearablePairing}>
        <span>
          <p className="card-label">웨어러블 연동</p>
          <strong className="card-title">카메라로 밴드 QR코드 스캔</strong>
          <p>웨어러블 화면의 QR 코드를 비추면 바로 연결을 시작합니다.</p>
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
  }

  useEffect(
    () => () => {
      stopScanResources()
    },
    [],
  )

  async function handleStartScan() {
    setScanStatus('scanning')
    setDetectedValue('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('이 환경에서는 카메라를 사용할 수 없어 스캔 화면만 표시합니다.')
      setScanStatus('blocked')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const detector = window.BarcodeDetector
        ? new window.BarcodeDetector({ formats: ['qr_code'] })
        : null

      activeScanRef.current = true
      setScannerMessage('카메라가 켜졌습니다. QR 코드를 프레임 안에 맞춰주세요.')
      scanQrFrame(detector)
    } catch {
      setScannerMessage(
        '카메라 권한이 필요합니다. 브라우저 권한을 허용한 뒤 다시 시도해주세요.',
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
        const rawValue = codes[0]?.rawValue

        if (rawValue && handleQrDetected(rawValue)) {
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

  function handleQrDetected(rawValue) {
    const pairing = parseWearablePairingPayload(rawValue)

    if (!pairing) {
      setScannerMessage(
        'Able Band 연동 QR이 아닙니다. 웨어러블 첫 화면의 QR을 다시 비춰주세요.',
      )
      return false
    }

    stopScanResources()
    setScanStatus('paired')
    setDetectedValue(rawValue)
    setScannerMessage(
      `${pairing.deviceName} ${pairing.pairingCode}를 인식했습니다. 웨어러블 연동이 완료되었습니다.`,
    )
    return true
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
          <video ref={videoRef} className="scanner-video" muted playsInline aria-hidden="true" />
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

    if (!pairingSessionId || !deviceId || !pairingCode) {
      return null
    }

    return {
      pairingSessionId,
      deviceId,
      pairingCode,
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

function GuardianConnectionScreen({
  guardians,
  guardianListState,
  onBack,
  onLinkGuardian,
  onRemoveGuardian,
}) {
  const [form, setForm] = useState({
    email: '',
    isPrimary: guardians.length === 0,
    notifyOnDanger: true,
  })
  const [message, setMessage] = useState({ tone: '', text: '' })
  const [submitting, setSubmitting] = useState(false)
  const [deletingGuardianId, setDeletingGuardianId] = useState(null)

  useEffect(() => {
    if (guardians.length === 0) {
      setForm((current) => (current.isPrimary ? current : { ...current, isPrimary: true }))
    }
  }, [guardians.length])

  function handleChange(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
    setMessage({ tone: '', text: '' })
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const email = form.email.trim()

    if (!email) {
      setMessage({ tone: 'error', text: '보호자 계정 이메일을 입력해주세요.' })
      return
    }

    if (!isValidEmail(email)) {
      setMessage({ tone: 'error', text: '올바른 이메일 형식으로 입력해주세요.' })
      return
    }

    setSubmitting(true)
    try {
      const guardian = await onLinkGuardian({
        email,
        isPrimary: form.isPrimary,
        notifyOnDanger: form.notifyOnDanger,
      })
      setMessage({
        tone: 'success',
        text: `${guardian.name || '보호자'} 보호자와 연결했습니다.`,
      })
      setForm((current) => ({
        ...current,
        email: '',
        isPrimary: false,
      }))
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error.message || '보호자 연결을 저장하지 못했습니다.',
      })
    } finally {
      setSubmitting(false)
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
      setMessage({
        tone: 'success',
        text: `${guardian.name} 보호자 연결을 해제했습니다.`,
      })
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error.message || '보호자 연결을 해제하지 못했습니다.',
      })
    } finally {
      setDeletingGuardianId(null)
    }
  }

  return (
    <section className="tab-stack guardian-connection-screen" aria-labelledby="guardian-connection-title">
      <form className="content-card guardian-form-card" onSubmit={handleSubmit}>
        <div className="guardian-form-hero device-add-hero">
          <button
            className="text-button back-button alert-detail-back"
            type="button"
            aria-label="목록으로 돌아가기"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
          </button>
          <strong className="card-title" id="guardian-connection-title">
            알림 받을 보호자를 등록해 주세요.
          </strong>
        </div>

        <label className="field">
          <span>보호자 이메일</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => handleChange('email', event.target.value)}
            placeholder="guardian@example.com"
            autoComplete="email"
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

        {message.text ? (
          <p
            className={message.tone === 'error' ? 'member-status-message error' : 'member-status-message'}
            role={message.tone === 'error' ? 'alert' : 'status'}
          >
            {message.text}
          </p>
        ) : null}

        <button className="primary-button full-button" type="submit" disabled={submitting}>
          {submitting ? '연결 중...' : '보호자 등록'}
        </button>
      </form>

      <section className="content-card connected-guardian-card" aria-labelledby="connected-guardian-title">
        <div className="section-title-row">
          <strong className="card-title" id="connected-guardian-title">연결된 보호자</strong>
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
            {guardians.map((guardian) => (
              <article className="connected-guardian-item" key={guardian.guardianId || guardian.name}>
                <p>{guardian.isPrimary ? '대표 보호자' : guardian.relation || '보호자'}</p>
                <strong>{guardian.name}</strong>
                <span>{guardian.phone || '연락처 미등록'}</span>
                <div>
                  <span className="guardian-chip">
                    {formatConnectionStatus(guardian.connectionStatus)}
                  </span>
                  {guardian.notifyOnDanger ? <span className="guardian-chip">긴급 알림 ON</span> : null}
                </div>
                <button
                  className="secondary-button full-button"
                  type="button"
                  disabled={deletingGuardianId === guardian.guardianId}
                  onClick={() => handleRemoveGuardian(guardian)}
                >
                  {deletingGuardianId === guardian.guardianId ? '해제 중...' : '연결 해제'}
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

function normalizeGuardianForView(guardian) {
  return {
    ...guardian,
    relation: guardian.relation || guardian.relationship || '가족',
    status: formatConnectionStatus(guardian.connectionStatus || guardian.status),
    connectionStatus: guardian.connectionStatus || guardian.status || 'CONNECTED',
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
