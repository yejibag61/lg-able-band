import { useEffect, useRef, useState } from 'react'
import { ModeSwitch } from './components/ModeSwitch'
import { WearableFrame } from './components/WearableFrame'
import { CurrentAlertScreen } from './features/alerts/CurrentAlertScreen'
import { WearableEmergencyScreen } from './features/emergency/WearableEmergencyScreen'
import { PairingQrScreen } from './features/pairing/PairingQrScreen'
import { UwbGuideScreen } from './features/uwb/UwbGuideScreen'
import {
  confirmAlert,
  createPairingPayload,
  getCurrentAlert,
  getInitialUwbSessionId,
  getPairingSession,
  getUwbSession,
  requestEmergencyHelp,
  replayAlert,
  stopUwbSession,
} from './services/wearableService'
import { triggerVibration, vibrationPatternForAlert } from './services/vibrationService'
import './App.css'

const DEFAULT_UWB_POLL_INTERVAL_MS = 2000

function App() {
  const [isPaired, setIsPaired] = useState(false)
  const [mode, setMode] = useState('alert')
  const [pairingStatus, setPairingStatus] = useState(getInitialPairingStatus)
  const [pairing] = useState(() => {
    const session = getPairingSession()
    return { ...session, pairingPayload: createPairingPayload(session) }
  })
  const [alert, setAlert] = useState(null)
  const [alertStatuses, setAlertStatuses] = useState({})
  const [uwbSession, setUwbSession] = useState(null)
  const [isUwbPolling, setIsUwbPolling] = useState(true)
  const isUwbPollingRef = useRef(true)
  const [statusMessage, setStatusMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const pairingCompleteTimerRef = useRef(null)

  useEffect(
    () => () => {
      window.clearTimeout(pairingCompleteTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!isPaired || mode !== 'alert') {
      return undefined
    }

    let isMounted = true

    async function loadAlert() {
      try {
        const currentAlert = await getCurrentAlert()
        if (isMounted) {
          setAlert(applyStoredAlertStatus(currentAlert, alertStatuses))
        }
      } catch (error) {
        if (isMounted) {
          setAlert(null)
          setStatusMessage(error.message || '알림을 불러오지 못했습니다.')
        }
      }
    }

    loadAlert()

    return () => {
      isMounted = false
    }
  }, [alertStatuses, isPaired, mode])

  useEffect(() => {
    if (!isPaired || mode !== 'uwb' || !isUwbPolling) {
      return undefined
    }

    let isMounted = true
    let timeoutId
    const sessionId = getInitialUwbSessionId()
    isUwbPollingRef.current = true

    async function loadUwbSession() {
      try {
        const session = await getUwbSession(sessionId)
        if (!isMounted || !isUwbPollingRef.current) {
          return
        }

        setUwbSession(session)
        if (session.navigationStatus === 'ACTIVE') {
          timeoutId = window.setTimeout(loadUwbSession, getUwbPollIntervalMs())
          return
        }

        setIsUwbPolling(false)
        isUwbPollingRef.current = false
      } catch {
        if (isMounted) {
          setUwbSession(null)
          setStatusMessage('진행 중인 위치 안내가 없습니다.')
          setIsUwbPolling(false)
          isUwbPollingRef.current = false
        }
      }
    }

    loadUwbSession()

    return () => {
      isMounted = false
      window.clearTimeout(timeoutId)
    }
  }, [isPaired, isUwbPolling, mode])

  async function handleReplay() {
    if (!alert) {
      return
    }

    setIsBusy(true)
    try {
      const replayed = await replayAlert(alert.alertId)
      triggerVibration(vibrationPatternForAlert(alert))
      setStatusMessage(`다시 듣기: ${replayed.voiceGuide}`)
    } catch {
      setStatusMessage('다시 듣기를 실행할 수 없습니다.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleConfirm() {
    if (!alert) {
      return
    }

    setIsBusy(true)
    try {
      const confirmed = await confirmAlert(alert.alertId)
      triggerVibration('MEDIUM')
      setAlertStatuses((currentStatuses) => ({
        ...currentStatuses,
        [alert.alertId]: confirmed.status,
      }))
      setAlert((currentAlert) => ({ ...currentAlert, status: confirmed.status }))
      setStatusMessage('확인 완료')
    } catch {
      setStatusMessage('확인 처리에 실패했습니다.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleStopUwb(sessionId) {
    const currentSessionId = sessionId || uwbSession?.sessionId
    if (!currentSessionId) {
      return
    }

    setIsBusy(true)
    try {
      isUwbPollingRef.current = false
      setIsUwbPolling(false)
      const stopped = await stopUwbSession(currentSessionId)
      triggerVibration(stopped.vibrationPattern)
      setUwbSession(stopped)
    } catch {
      setStatusMessage('탐색 종료에 실패했습니다.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleEmergencyRequest() {
    setIsBusy(true)
    setStatusMessage('긴급 요청을 보내는 중입니다.')
    try {
      const response = await requestEmergencyHelp('손목 웨어러블에서 긴급 요청')
      triggerVibration('LONG_TWICE')
      setStatusMessage(response.message || '보호자에게 긴급 요청을 보냈습니다.')
    } catch (error) {
      setStatusMessage(formatEmergencyErrorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="app-root">
      <WearableFrame>
        {isPaired ? (
          <ModeSwitch
            activeMode={mode}
            onModeChange={(nextMode) => {
              setMode(nextMode)
              setStatusMessage('')
              if (nextMode === 'uwb') {
                isUwbPollingRef.current = true
                setIsUwbPolling(true)
              }
            }}
          />
        ) : null}

        {!isPaired ? (
          <PairingQrScreen
            pairing={pairing}
            status={pairingStatus}
            onPairComplete={() => {
              setPairingStatus('success')
              window.clearTimeout(pairingCompleteTimerRef.current)
              pairingCompleteTimerRef.current = window.setTimeout(() => {
                setIsPaired(true)
                setMode('alert')
              }, 80)
            }}
            onResetPairing={() => {
              window.clearTimeout(pairingCompleteTimerRef.current)
              setPairingStatus('waiting')
            }}
          />
        ) : null}

        {isPaired && mode === 'alert' ? (
          <CurrentAlertScreen
            alert={alert}
            actionMessage={statusMessage}
            isBusy={isBusy}
            onConfirm={handleConfirm}
            onReplay={handleReplay}
          />
        ) : null}

        {isPaired && mode === 'uwb' ? (
          <UwbGuideScreen
            session={uwbSession}
            actionMessage={statusMessage}
            isBusy={isBusy}
            onStandby={() => {
              setMode('idle')
              setStatusMessage('')
            }}
            onStop={handleStopUwb}
          />
        ) : null}

        {isPaired && mode === 'idle' ? (
          <section className="state-screen standby-screen" aria-label="웨어러블 대기">
            <p className="eyebrow">Able Band</p>
            <h1>손목에서 대기 중</h1>
            <p>알림이나 위치 안내가 시작되면 바로 표시합니다.</p>
            <dl className="standby-meta">
              <div>
                <dt>배터리</dt>
                <dd>배터리 82%</dd>
              </div>
              <div>
                <dt>연동</dt>
                <dd>휴대폰 연결됨</dd>
              </div>
            </dl>
            <button className="primary-action" type="button" onClick={() => setMode('emergency')}>
              긴급 요청
            </button>
          </section>
        ) : null}

        {isPaired && mode === 'emergency' ? (
          <WearableEmergencyScreen
            actionMessage={statusMessage}
            isBusy={isBusy}
            onCancel={() => {
              setMode('idle')
              setStatusMessage('')
            }}
            onRequest={handleEmergencyRequest}
          />
        ) : null}
      </WearableFrame>
    </main>
  )
}

function applyStoredAlertStatus(alert, alertStatuses) {
  if (!alert) {
    return null
  }

  const storedStatus = alertStatuses[alert.alertId]
  return storedStatus ? { ...alert, status: storedStatus } : alert
}

function getUwbPollIntervalMs() {
  const override = Number(window.__ABLE_BAND_UWB_POLL_MS__)
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_UWB_POLL_INTERVAL_MS
}

function getInitialPairingStatus() {
  const requestedStatus = new URLSearchParams(window.location.search).get('pairing')
  if (requestedStatus === 'expired' || requestedStatus === 'invalid') {
    return requestedStatus
  }

  return 'waiting'
}

function formatEmergencyErrorMessage(error) {
  const messages = {
    NO_GUARDIAN: '연결된 보호자가 없습니다. 휴대폰 앱에서 보호자를 먼저 연결해주세요.',
    DELIVERY_FAILED: '보호자에게 알림을 보내지 못했습니다. 잠시 후 다시 시도해주세요.',
    UNAUTHORIZED: '연동 인증이 만료되었습니다. 휴대폰에서 다시 연동해주세요.',
    SERVER_ERROR: '긴급 요청을 보내지 못했습니다. 잠시 후 다시 시도해주세요.',
  }

  return messages[error?.code] || error?.message || messages.SERVER_ERROR
}

export default App
