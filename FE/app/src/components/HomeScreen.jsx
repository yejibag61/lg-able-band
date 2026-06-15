import { useEffect, useMemo, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { LivingSignalSettingsScreen } from '../features/living-signal/LivingSignalSettingsScreen'
import { getAppPreview, getHomeSummary } from '../services/homeService'
import { createEmergencyRequest } from '../services/emergencyService'
import { deleteGuardian, getGuardians, linkGuardianByEmail } from '../services/guardianService'
import { completeWearablePairing } from '../services/wearablePairingService'
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
  { id: 'devices', label: '기기' },
  { id: 'alerts', label: '알림' },
  { id: 'menu', label: '메뉴' },
]

const tabTitles = {
  home: 'Able Band 홈',
  alerts: '실시간 알림',
  devices: '기기와 UWB',
  menu: '메뉴',
}

const MAX_DEVICE_COUNT = 6
const CAMERA_FRAME_TIMEOUT_MS = 6500

const connectionStatusLabels = {
  CONNECTED: '연결됨',
  PENDING: '대기 중',
  DISCONNECTED: '연결 해제',
}

export function HomeScreen({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('home')
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
        const { summary, preview } = await loadHomeData()

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
    setEmergencyMessage('긴급 요청을 전송하고 있습니다.')

    try {
      const request = await createEmergencyRequest()
      setEmergencyMessage(formatEmergencyRequestMessage(request))

      try {
        const { summary, preview } = await loadHomeData()
        setHomeState({ loading: false, error: '', summary, preview })
      } catch {
        setEmergencyMessage((current) => `${current} 홈 정보는 새로고침하지 못했습니다.`)
      }
    } catch (error) {
      setEmergencyMessage(error.message || '긴급 요청 전송에 실패했습니다.')
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
          <span className="home-brand-logo-frame" aria-hidden="true">
            <img
              className="home-brand-logo"
              src="/LG_Able_Band_wordmark_transparent.png"
              alt="LG Able Band"
            />
          </span>
          <h1 id="home-title">{displayTitle}</h1>
          {activeTab === 'home' ? <p className="header-summary">{todayMessage}</p> : null}
        </div>
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
          <WearablePairingScannerScreen
            onBack={() => setMenuScreen('root')}
            onPairingComplete={async () => {
              const { summary: nextSummary, preview: nextPreview } = await loadHomeData()
              setHomeState({
                loading: false,
                error: '',
                summary: nextSummary,
                preview: nextPreview,
              })
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
  accessibility,
  guardians,
  livingSignals,
  onOpenGuardianConnection,
  onOpenLivingSignals,
  onOpenWearablePairing,
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
      status: formatConnectionStatus(member.connectionStatus || member.status),
    })),
  ]

  return (
    <section className="tab-stack" aria-labelledby="menu-title">
      <div className="content-card hero-card">
        <p className="card-label">빠른 설정</p>
        <h2 id="menu-title">자주 바꾸는 설정만 모아 두었어요.</h2>
        <p>{userName}님의 연결 상태와 보호자, 생활 신호 기능을 여기에서 확인할 수 있습니다.</p>
      </div>

      <section className="content-card">
        <div className="section-title-row">
          <h2>접근성 설정</h2>
          <span>{formatTextSize(accessibility.textSize)}</span>
        </div>
        <div className="settings-grid">
          <span>{formatAccessibilityType(accessibility.disabilityType)}</span>
          <span>{accessibility.voiceGuide ? '음성 안내 ON' : '음성 안내 OFF'}</span>
          <span>{accessibility.vibrationGuide ? '진동 안내 ON' : '진동 안내 OFF'}</span>
          <span>{accessibility.highContrast ? '고대비 ON' : '고대비 OFF'}</span>
        </div>
      </section>

      <section className="soft-card home-member-card" aria-labelledby="home-member-title">
        <div className="home-member-header">
          <div>
            <p className="card-label">보호자 연결</p>
            <h2 id="home-member-title">내 멤버</h2>
            <p>{guardianMembers.length}명</p>
          </div>
          <button
            className="member-more-button"
            type="button"
            aria-label="내 멤버 관리"
            onClick={onOpenGuardianConnection}
          >
            관리
          </button>
        </div>

        <div className="home-member-list" aria-label="내 멤버 목록">
          <button className="home-member-item invite" type="button" onClick={onOpenGuardianConnection}>
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
                {member.id === 'me' ? <small>본인</small> : null}
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
        <span className="wearable-pairing-icon" aria-hidden="true">
          QR
        </span>
        <span>
          <p className="card-label">웨어러블 연동</p>
          <h2>밴드 QR을 카메라로 스캔해요.</h2>
          <p>웨어러블 화면의 QR 코드를 비추면 바로 연결을 시작합니다.</p>
        </span>
      </button>

      <button className="soft-card settings-link-card" type="button" onClick={onOpenLivingSignals}>
        <p className="card-label">생활 신호 설정</p>
        <h2>등록된 생활 알림음을 관리하세요.</h2>
        <p>
          현재 {livingSignals.summary.registeredSoundCount}개 신호, 샘플{' '}
          {livingSignals.summary.enrolledClipCount}개가 등록되어 있습니다.
        </p>
      </button>

      <button className="secondary-button full-button" type="button" onClick={onLogout}>
        로그아웃
      </button>
    </section>
  )
}

function WearablePairingScannerScreen({ onBack, onPairingComplete }) {
  const [scannerMessage, setScannerMessage] = useState(
    '웨어러블 화면의 QR 코드를 프레임 안에 맞춰 주세요.',
  )
  const [scanStatus, setScanStatus] = useState('ready')
  const [detectedValue, setDetectedValue] = useState('')
  const [hasCameraPreview, setHasCameraPreview] = useState(false)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const scanFrameRef = useRef(null)
  const activeScanRef = useRef(false)

  function stopScanResources() {
    activeScanRef.current = false
    setHasCameraPreview(false)

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
    stopScanResources()
    setScanStatus('scanning')
    setDetectedValue('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('이 환경에서는 카메라를 사용할 수 없어 스캔 화면만 표시됩니다.')
      setScanStatus('blocked')
      return
    }

    const cameraAttempts = await createCameraAttempts()
    let lastError = null

    for (const constraints of cameraAttempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          await waitForVideoFrame(videoRef.current)
        }

        const detector = window.BarcodeDetector
          ? new window.BarcodeDetector({ formats: ['qr_code'] })
          : null

        activeScanRef.current = true
        setHasCameraPreview(true)
        setScannerMessage('카메라가 켜졌습니다. QR 코드를 프레임 안에 맞춰 주세요.')
        scanQrFrame(detector)
        return
      } catch (error) {
        lastError = error
        stopScanResources()
      }
    }

    setScannerMessage(formatCameraErrorMessage(lastError))
    setScanStatus('blocked')
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
        setScannerMessage('카메라 화면을 읽을 수 없습니다. 다시 시도해 주세요.')
        setScanStatus('blocked')
        stopScanResources()
        return
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      try {
        const rawValue = await detectQrValue({ canvas, context, detector })

        if (rawValue && (await handleQrDetected(rawValue))) {
          return
        }
      } catch {
        setScannerMessage('QR을 읽는 중 문제가 발생했습니다. 카메라를 다시 켜 주세요.')
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
        'Able Band 연동용 QR이 아닙니다. 웨어러블 첫 화면의 QR을 다시 비춰 주세요.',
      )
      return false
    }

    stopScanResources()
    setScanStatus('verifying')
    setDetectedValue(rawValue)
    setScannerMessage('연동 정보를 확인하는 중입니다.')

    try {
      const result = await completeWearablePairing(pairing)
      await onPairingComplete?.(result).catch(() => null)
      setScanStatus('paired')
      setScannerMessage(result?.message || '웨어러블 연동이 완료되었습니다.')
    } catch (error) {
      setScanStatus('invalid')
      setScannerMessage(error.message || '웨어러블 연동에 실패했습니다. QR을 다시 확인해 주세요.')
    }

    return true
  }

  function handleStopScan() {
    stopScanResources()
    setScanStatus('ready')
    setScannerMessage('스캔을 중지했습니다. 다시 시작하려면 카메라를 켜 주세요.')
  }

  return (
    <section className="tab-stack wearable-scanner-screen" aria-labelledby="wearable-scanner-title">
      <button className="text-link-button" type="button" onClick={onBack}>
        메뉴로 돌아가기
      </button>

      <section className="content-card wearable-scanner-card">
        <p className="card-label">웨어러블 연동</p>
        <h2 id="wearable-scanner-title">밴드 QR을 스캔해주세요.</h2>
        <p>
          웨어러블 첫 화면 또는 연동 화면에 표시된 QR 코드를 카메라로 비춰 주세요.
        </p>

        <div className={`qr-scanner-preview scanner-${scanStatus}`} aria-label="QR 카메라 스캔 영역">
          <video
            ref={videoRef}
            className={hasCameraPreview ? 'scanner-video video-ready' : 'scanner-video'}
            muted
            autoPlay
            playsInline
            aria-hidden="true"
          />
          <canvas ref={canvasRef} className="scanner-canvas" aria-hidden="true" />
          <div className="scanner-top-bar">
            <span>QR 스캔</span>
            <span>{formatScannerStatus(scanStatus)}</span>
          </div>
          <div className="scanner-frame" aria-hidden="true">
            <span className="scanner-corner corner-tl" />
            <span className="scanner-corner corner-tr" />
            <span className="scanner-corner corner-bl" />
            <span className="scanner-corner corner-br" />
          </div>
          <div className="scanner-bottom-bar">
            <span />
            <strong>QR을 프레임 안에 맞춰 주세요</strong>
            <span />
          </div>
        </div>

        <p className="member-status-message" role="status">
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

function waitForVideoFrame(video) {
  const timeoutMs = getCameraFrameTimeoutMs()

  return new Promise((resolve, reject) => {
    let timeoutId = 0
    let frameId = 0
    let videoFrameCallbackId = 0

    function cleanup() {
      window.clearTimeout(timeoutId)
      window.cancelAnimationFrame(frameId)
      if (videoFrameCallbackId && video.cancelVideoFrameCallback) {
        video.cancelVideoFrameCallback(videoFrameCallbackId)
      }
      video.removeEventListener('loadedmetadata', checkFrame)
      video.removeEventListener('canplay', checkFrame)
      video.removeEventListener('playing', checkFrame)
      video.removeEventListener('resize', checkFrame)
    }

    function checkFrame() {
      if (hasReadableVideoFrame(video)) {
        cleanup()
        resolve()
        return
      }

      frameId = window.requestAnimationFrame(checkFrame)
    }

    timeoutId = window.setTimeout(() => {
      cleanup()
      reject(new Error('NO_VIDEO_FRAME'))
    }, timeoutMs)

    if (video.requestVideoFrameCallback) {
      videoFrameCallbackId = video.requestVideoFrameCallback(() => {
        cleanup()
        resolve()
      })
    }

    video.addEventListener('loadedmetadata', checkFrame)
    video.addEventListener('canplay', checkFrame)
    video.addEventListener('playing', checkFrame)
    video.addEventListener('resize', checkFrame)
    checkFrame()
  })
}

function getCameraFrameTimeoutMs() {
  return (
    parsePositiveTimeoutMs(window.__ABLE_BAND_CAMERA_FRAME_TIMEOUT_MS__) ??
    parsePositiveTimeoutMs(import.meta.env.VITE_CAMERA_FRAME_TIMEOUT_MS) ??
    parsePositiveTimeoutMs(import.meta.env.VITE_ABLE_BAND_CAMERA_FRAME_TIMEOUT_MS) ??
    CAMERA_FRAME_TIMEOUT_MS
  )
}

function parsePositiveTimeoutMs(value) {
  const timeoutMs = Number(value)
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : null
}

function hasReadableVideoFrame(video) {
  return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
}

async function createCameraAttempts() {
  const defaultCamera = { video: true }
  const rearCamera = { video: { facingMode: { ideal: 'environment' } } }
  const deviceCameraAttempts = await createVideoDeviceAttempts()

  if (isTouchCameraDevice()) {
    return uniqueCameraAttempts([rearCamera, ...deviceCameraAttempts, defaultCamera])
  }

  return uniqueCameraAttempts([...deviceCameraAttempts, defaultCamera, rearCamera])
}

async function createVideoDeviceAttempts() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return []
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((device) => device.kind === 'videoinput' && device.deviceId)
      .sort(compareVideoDevices)
      .map((device) => ({
        video: {
          deviceId: {
            exact: device.deviceId,
          },
        },
      }))
  } catch {
    return []
  }
}

function compareVideoDevices(firstDevice, secondDevice) {
  return videoDevicePriority(firstDevice) - videoDevicePriority(secondDevice)
}

function videoDevicePriority(device) {
  const label = device.label.toLowerCase()

  if (label.includes('virtual') || label.includes('mirametrix')) {
    return 2
  }

  if (label.includes('usb') || label.includes('webcam') || label.includes('camera')) {
    return 0
  }

  return 1
}

function uniqueCameraAttempts(attempts) {
  const seen = new Set()
  return attempts.filter((attempt) => {
    const key = JSON.stringify(attempt)
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function isTouchCameraDevice() {
  return navigator.maxTouchPoints > 0 && window.matchMedia?.('(pointer: coarse)').matches
}

function formatCameraErrorMessage(error) {
  if (error instanceof Error && error.name === 'NotAllowedError') {
    return '카메라 권한이 필요합니다. 브라우저 권한을 허용한 뒤 다시 시도해 주세요.'
  }

  if (error instanceof Error && error.name === 'NotReadableError') {
    return '카메라가 다른 앱에서 사용 중입니다. 다른 앱을 종료한 뒤 다시 시도해 주세요.'
  }

  if (error instanceof Error && error.name === 'NotFoundError') {
    return '사용 가능한 카메라를 찾지 못했습니다. 카메라 연결 상태를 확인해 주세요.'
  }

  if (error instanceof Error && error.message === 'NO_VIDEO_FRAME') {
    return '카메라는 켜졌지만 화면을 읽을 수 없습니다. 다른 카메라 앱을 종료한 뒤 다시 시도해 주세요.'
  }

  return '카메라를 시작하지 못했습니다. 브라우저 권한과 카메라 상태를 확인해 주세요.'
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
      issuedAt: params.get('issuedAt') || '',
      expiresAt: params.get('expiresAt') || '',
      deviceName: params.get('deviceName') || (deviceId.includes('able-band') ? 'LG Able Band' : '웨어러블'),
    }
  } catch {
    return null
  }
}

async function detectQrValue({ canvas, context, detector }) {
  if (detector) {
    const codes = await detector.detect(canvas)
    const rawValue = codes[0]?.rawValue

    if (rawValue) {
      return rawValue
    }
  }

  if (!context.getImageData) {
    return ''
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const customDecoder = window.__ABLE_BAND_QR_DECODER__

  if (typeof customDecoder === 'function') {
    const decoded = customDecoder(imageData, canvas.width, canvas.height)
    return typeof decoded === 'string' ? decoded : decoded?.data || ''
  }

  const decoded = jsQR(imageData.data, imageData.width || canvas.width, imageData.height || canvas.height)
  return decoded?.data || ''
}

function formatScannerStatus(scanStatus) {
  if (scanStatus === 'paired') {
    return '연동 완료'
  }

  if (scanStatus === 'verifying') {
    return '확인 중'
  }

  if (scanStatus === 'invalid') {
    return '다시 확인'
  }

  return '대기 중'
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
  const isPrimarySelected = guardians.length === 0 || form.isPrimary

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
      setMessage({ tone: 'error', text: '보호자 계정 이메일을 입력해 주세요.' })
      return
    }

    if (!isValidEmail(email)) {
      setMessage({ tone: 'error', text: '올바른 이메일 형식으로 입력해 주세요.' })
      return
    }

    setSubmitting(true)
    try {
      const guardian = await onLinkGuardian({
        email,
        isPrimary: isPrimarySelected,
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
        text: error.message || '보호자 연결에 실패했습니다.',
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
        text: error.message || '보호자 연결 해제에 실패했습니다.',
      })
    } finally {
      setDeletingGuardianId(null)
    }
  }

  return (
    <section className="tab-stack guardian-connection-screen" aria-labelledby="guardian-connection-title">
      <button className="text-link-button" type="button" onClick={onBack}>
        메뉴로 돌아가기
      </button>

      <form className="content-card guardian-form-card" onSubmit={handleSubmit}>
        <p className="card-label">보호자 연결</p>
        <h2 id="guardian-connection-title">긴급 알림을 받을 보호자를 등록해 주세요.</h2>

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
              checked={isPrimarySelected}
              disabled={guardians.length === 0}
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
          <h2 id="connected-guardian-title">연결된 보호자</h2>
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

async function loadHomeData() {
  const [summary, preview] = await Promise.all([getHomeSummary(), getAppPreview()])
  return { summary, preview }
}

function formatEmergencyRequestMessage(request) {
  if (request?.guardianNotified) {
    return '보호자에게 긴급 요청을 보냈습니다.'
  }

  if (request?.status === 'SENT') {
    return '긴급 요청을 보냈습니다.'
  }

  return request?.message || '긴급 요청이 접수되었습니다.'
}

function formatConnectionStatus(status) {
  return connectionStatusLabels[status] || status || '연결됨'
}

function formatAccessibilityType(type) {
  if (type === 'VISUAL' || type === '시각') {
    return '시각 안내'
  }

  if (type === 'HEARING' || type === '청각') {
    return '청각 안내'
  }

  return type || '기본 안내'
}

function formatTextSize(textSize) {
  if (!textSize) {
    return '기본 글씨'
  }

  if (textSize === 'LARGE') {
    return '큰 글씨'
  }

  return textSize
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
