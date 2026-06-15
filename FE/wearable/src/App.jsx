import { useCallback, useEffect, useRef, useState } from 'react'
import { ModeSwitch } from './components/ModeSwitch'
import { WearableFrame } from './components/WearableFrame'
import { VoiceChatbot } from './components/VoiceChatbot'
import { CurrentAlertScreen } from './features/alerts/CurrentAlertScreen'
import { WearableEmergencyScreen } from './features/emergency/WearableEmergencyScreen'
import { PairingQrScreen } from './features/pairing/PairingQrScreen'
import { UwbGuideScreen } from './features/uwb/UwbGuideScreen'
import {
  confirmAlert,
  createPairingSession,
  getCurrentAlerts,
  getInitialUwbSessionId,
  getPairingSessionStatus,
  getUwbTargets,
  getUwbSession,
  requestEmergencyHelp,
  saveWearableAccessToken,
  startUwbSession,
  stopUwbSession,
  unpairWearable,
} from './services/wearableService'
import { clearWearableAccessToken, getWearableAccessToken } from './services/wearableApiClient'
import { triggerVibration } from './services/vibrationService'
import {
  getPairingPollIntervalMs,
  getPairingSuccessTransitionMs,
  getUwbPollIntervalMs,
} from './runtimeTiming'
import './App.css'

const PAIRED_PAIRING_STORAGE_KEY = 'lg-able-band.pairingSession'

function App() {
  const initialPairing = getStoredPairedPairingSession()
  const [isPaired, setIsPaired] = useState(Boolean(initialPairing))
  const [mode, setMode] = useState('alert')
  const [pairingStatus, setPairingStatus] = useState(() =>
    initialPairing ? 'success' : getInitialPairingStatus(),
  )
  const [pairing, setPairing] = useState(initialPairing)
  const [pairingGeneration, setPairingGeneration] = useState(0)
  const [alertQueue, setAlertQueue] = useState([])
  const [alertIndex, setAlertIndex] = useState(0)
  const [alertStatuses, setAlertStatuses] = useState({})
  const [uwbSession, setUwbSession] = useState(null)
  const [uwbTargets, setUwbTargets] = useState([])
  const [isUwbTargetLoading, setIsUwbTargetLoading] = useState(false)
  const [isUwbPolling, setIsUwbPolling] = useState(true)
  const isUwbPollingRef = useRef(true)
  const [statusMessage, setStatusMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [syncedTime, setSyncedTime] = useState(() => new Date())
  const pairingPollTimerRef = useRef(null)
  const pairingCompleteTimerRef = useRef(null)
  const pairingCompletedRef = useRef(false)
  const selectedAlert = alertQueue[alertIndex] || null

  const resetPairingSession = useCallback((message = '') => {
    window.clearTimeout(pairingCompleteTimerRef.current)
    window.clearTimeout(pairingPollTimerRef.current)
    clearStoredPairedPairingSession()
    pairingCompletedRef.current = false
    isUwbPollingRef.current = true
    setIsPaired(false)
    setMode('alert')
    setPairing(null)
    setPairingStatus('waiting')
    setPairingGeneration((current) => current + 1)
    setAlertQueue([])
    setAlertIndex(0)
    setAlertStatuses({})
    setUwbSession(null)
    setUwbTargets([])
    setIsUwbTargetLoading(false)
    setIsUwbPolling(true)
    setStatusMessage(message)
  }, [])

  const completePairing = useCallback((pairedSession = {}) => {
    if (pairingCompletedRef.current) {
      return
    }

    pairingCompletedRef.current = true
    saveWearableAccessToken(pairedSession.accessToken)
    storePairedPairingSession(pairedSession)
    setPairing((current) => mergePairingSession(current, pairedSession))
    setPairingStatus('success')
    window.clearTimeout(pairingPollTimerRef.current)
    window.clearTimeout(pairingCompleteTimerRef.current)
    pairingCompleteTimerRef.current = window.setTimeout(() => {
      setIsPaired(true)
      setMode('alert')
    }, getPairingSuccessTransitionMs())
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setSyncedTime(new Date())
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(
    () => () => {
      window.clearTimeout(pairingPollTimerRef.current)
      window.clearTimeout(pairingCompleteTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (isPaired || isTerminalPairingStatus(pairingStatus)) {
      return undefined
    }

    let isMounted = true
    window.clearTimeout(pairingPollTimerRef.current)

    function handlePairingStatus(nextSession) {
      if (nextSession.status === 'success') {
        completePairing(nextSession)
        return
      }

      if (nextSession.status === 'expired' || nextSession.status === 'invalid') {
        setPairingStatus(nextSession.status)
        return
      }

      setPairingStatus('waiting')
      pairingPollTimerRef.current = window.setTimeout(() => {
        pollPairingSession(nextSession)
      }, getPairingPollIntervalMs())
    }

    async function pollPairingSession(currentSession) {
      try {
        const nextSession = await getPairingSessionStatus(currentSession)
        if (!isMounted || pairingCompletedRef.current) {
          return
        }

        const mergedSession = mergePairingSession(currentSession, nextSession)
        setPairing((current) => mergePairingSession(current, mergedSession))
        handlePairingStatus(mergedSession)
      } catch {
        if (!isMounted || pairingCompletedRef.current) {
          return
        }

        pairingPollTimerRef.current = window.setTimeout(() => {
          pollPairingSession(currentSession)
        }, getPairingPollIntervalMs())
      }
    }

    async function startPairingSession() {
      try {
        const nextSession = await createPairingSession()
        if (!isMounted || pairingCompletedRef.current) {
          return
        }

        setPairing(nextSession)
        handlePairingStatus(nextSession)
      } catch (error) {
        if (isMounted) {
          setPairingStatus('invalid')
          setStatusMessage(error.message || '연동 QR 생성에 실패했습니다.')
        }
      }
    }

    startPairingSession()

    return () => {
      isMounted = false
      window.clearTimeout(pairingPollTimerRef.current)
    }
  }, [completePairing, isPaired, pairingGeneration, pairingStatus])

  useEffect(() => {
    if (!isPaired || mode !== 'alert') {
      return undefined
    }

    let isMounted = true

    async function loadAlert() {
      try {
        const alerts = await getCurrentAlerts()
        if (isMounted) {
          const nextAlerts = alerts
            .map((item) => applyStoredAlertStatus(item, alertStatuses))
            .filter((item) => item.status !== 'CONFIRMED')
          setAlertQueue(nextAlerts)
          setAlertIndex((current) => Math.min(current, Math.max(nextAlerts.length - 1, 0)))
        }
      } catch (error) {
        if (isMounted) {
          if (isAuthExpiredError(error)) {
            resetPairingSession('')
            return
          }

          setAlertQueue([])
          setStatusMessage(error.message || '알림을 불러오지 못했습니다.')
        }
      }
    }

    loadAlert()

    return () => {
      isMounted = false
    }
  }, [alertStatuses, isPaired, mode, resetPairingSession])

  useEffect(() => {
    if (!isPaired || mode !== 'deviceSelect') {
      return undefined
    }

    let isMounted = true

    async function loadTargets() {
      setIsUwbTargetLoading(true)
      try {
        const targets = await getUwbTargets()
        if (isMounted) {
          setUwbTargets(targets)
        }
      } catch {
        if (isMounted) {
          setUwbTargets([])
          setStatusMessage('위치 안내 기기를 불러오지 못했습니다.')
        }
      } finally {
        if (isMounted) {
          setIsUwbTargetLoading(false)
        }
      }
    }

    loadTargets()

    return () => {
      isMounted = false
    }
  }, [isPaired, mode])

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

  async function handleConfirm() {
    if (!selectedAlert) {
      return
    }

    setIsBusy(true)
    try {
      const confirmed = await confirmAlert(selectedAlert.alertId)
      triggerVibration('MEDIUM')
      setAlertStatuses((currentStatuses) => ({
        ...currentStatuses,
        [selectedAlert.alertId]: confirmed.status,
      }))
      setAlertQueue((currentQueue) => {
        const nextQueue = currentQueue.filter((item) => item.alertId !== selectedAlert.alertId)
        setAlertIndex((currentIndex) => Math.min(currentIndex, Math.max(nextQueue.length - 1, 0)))
        return nextQueue
      })
      setStatusMessage('확인한 알림을 삭제했습니다.')
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
      setMode('deviceSelect')
      setStatusMessage('탐색을 종료했습니다. 다른 가전을 선택할 수 있습니다.')
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
      setStatusMessage(
        response.message
          ? `${response.message} 보호자 앱 수신을 확인했습니다.`
          : '보호자에게 긴급 요청을 보냈습니다. 보호자 앱 수신을 확인했습니다.',
      )
    } catch (error) {
      setStatusMessage(formatEmergencyErrorMessage(error))
    } finally {
      setIsBusy(false)
    }
  }

  async function handleUnpair() {
    setIsBusy(true)
    try {
      await unpairWearable(pairing)
      resetPairingSession('연결이 해제되었습니다')
    } catch {
      setStatusMessage('연동 해제에 실패했습니다.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="app-root">
      <WearableFrame>
        {isPaired ? (
          <ModeSwitch
            activeMode={mode === 'deviceSelect' ? 'uwb' : mode}
            onModeChange={(nextMode) => {
              setStatusMessage('')
              if (nextMode === 'uwb') {
                setMode('deviceSelect')
                isUwbPollingRef.current = false
                setIsUwbPolling(false)
                return
              }

              setMode(nextMode)
            }}
          />
        ) : null}

        {!isPaired ? (
          <PairingQrScreen
            pairing={pairing}
            status={pairingStatus}
            showManualComplete={isManualPairingEnabled()}
            onPairComplete={() => completePairing(pairing)}
            onResetPairing={() => resetPairingSession()}
          />
        ) : null}

        {!isPaired && statusMessage ? (
          <p className="live-message" role="status">
            {statusMessage}
          </p>
        ) : null}

        {isPaired && mode === 'alert' ? (
          <CurrentAlertScreen
            alert={selectedAlert}
            alertPage={alertIndex + 1}
            alertTotal={alertQueue.length}
            actionMessage={statusMessage}
            isBusy={isBusy}
            syncedTime={syncedTime}
            onConfirm={handleConfirm}
            onNextAlert={() => setAlertIndex((current) => Math.min(current + 1, alertQueue.length - 1))}
            onPreviousAlert={() => setAlertIndex((current) => Math.max(current - 1, 0))}
            onResetPairing={() => resetPairingSession()}
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
            <div className="action-row">
              <button className="primary-action" type="button" onClick={() => setMode('emergency')}>
                긴급 요청
              </button>
              <button
                className="secondary-action"
                disabled={isBusy}
                type="button"
                onClick={handleUnpair}
              >
                연동 해제
              </button>
            </div>
          </section>
        ) : null}

        {isPaired && mode === 'deviceSelect' ? (
          <DeviceSelectScreen
            actionMessage={statusMessage}
            devices={uwbTargets}
            isLoading={isUwbTargetLoading}
            onSelect={async (device) => {
              setIsBusy(true)
              try {
                const session = await startUwbSession(device.deviceId)
                setUwbSession(session)
                setStatusMessage('')
                setMode('uwb')
                isUwbPollingRef.current = true
                setIsUwbPolling(true)
              } catch {
                setStatusMessage('위치 안내를 시작하지 못했습니다.')
              } finally {
                setIsBusy(false)
              }
            }}
          />
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

        {isPaired ? (
          <VoiceChatbot
            alert={selectedAlert}
            alertQueue={alertQueue}
            mode={mode}
            statusMessage={statusMessage}
            uwbSession={uwbSession}
          />
        ) : null}
      </WearableFrame>
    </main>
  )
}

function DeviceSelectScreen({ actionMessage, devices = [], isLoading, onSelect }) {
  const displayDevices = devices

  return (
    <section className="state-screen device-select-screen" aria-labelledby="device-select-title">
      <div className="device-select-header">
        <div>
          <p className="eyebrow">UWB</p>
          <h1 id="device-select-title">내 가전 목록</h1>
        </div>
        <strong>{isLoading ? '확인 중' : `${displayDevices.length}개`}</strong>
      </div>
      <div className="device-select-grid">
        {displayDevices.map((device) => (
          <button
            className="device-select-card"
            type="button"
            key={device.deviceId || device.name}
            onClick={() => onSelect(device)}
          >
            <span className={`device-select-icon icon-${device.iconTone}`} aria-hidden="true">
              {device.icon}
            </span>
            <span className={`device-status-dot status-${device.statusTone}`} aria-hidden="true" />
            <span className="device-select-name">{device.name}</span>
            <span className="device-select-status">{device.status}</span>
          </button>
        ))}
      </div>
      {actionMessage ? (
        <p className="live-message" role="status">
          {actionMessage}
        </p>
      ) : null}
    </section>
  )
}

function applyStoredAlertStatus(alert, alertStatuses) {
  if (!alert) {
    return null
  }

  const storedStatus = alertStatuses[alert.alertId]
  return storedStatus ? { ...alert, status: storedStatus } : alert
}

function getInitialPairingStatus() {
  const requestedStatus = new URLSearchParams(window.location.search).get('pairing')
  if (requestedStatus === 'expired' || requestedStatus === 'invalid') {
    return requestedStatus
  }

  return 'waiting'
}

function getStoredPairedPairingSession() {
  try {
    const stored = JSON.parse(localStorage.getItem(PAIRED_PAIRING_STORAGE_KEY) || 'null')
    if (!isPersistablePairingSession(stored) || !getWearableAccessToken()) {
      clearStoredPairedPairingSession()
      return null
    }

    return {
      ...stored,
      status: 'success',
    }
  } catch {
    clearStoredPairedPairingSession()
    return null
  }
}

function storePairedPairingSession(session) {
  if (!isPersistablePairingSession(session) || !session.accessToken) {
    return
  }

  localStorage.setItem(
    PAIRED_PAIRING_STORAGE_KEY,
    JSON.stringify({
      pairingSessionId: session.pairingSessionId,
      deviceId: session.deviceId,
      deviceName: session.deviceName,
      pairingCode: session.pairingCode,
      nonce: session.nonce,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
      expiresInMinutes: session.expiresInMinutes,
      pairingPayload: session.pairingPayload,
      accessToken: session.accessToken,
      status: 'success',
    }),
  )
}

function clearStoredPairedPairingSession() {
  localStorage.removeItem(PAIRED_PAIRING_STORAGE_KEY)
  clearWearableAccessToken()
}

function isPersistablePairingSession(session) {
  return Boolean(session?.pairingSessionId && session?.deviceId && session?.nonce)
}

function isAuthExpiredError(error) {
  return error?.status === 401 || error?.status === 403 || error?.code === 'UNAUTHORIZED'
}

function isTerminalPairingStatus(status) {
  return status === 'success' || status === 'expired' || status === 'invalid'
}

function isManualPairingEnabled() {
  return window.__ABLE_BAND_PAIRING_MANUAL__ === true
}

function mergePairingSession(currentSession, nextSession) {
  if (!currentSession) {
    return nextSession
  }

  return {
    ...currentSession,
    ...nextSession,
    pairingSessionId: nextSession.pairingSessionId || currentSession.pairingSessionId,
    deviceId: nextSession.deviceId || currentSession.deviceId,
    deviceName: nextSession.deviceName || currentSession.deviceName,
    pairingCode: nextSession.pairingCode || currentSession.pairingCode,
    nonce: nextSession.nonce || currentSession.nonce,
    issuedAt: nextSession.issuedAt || currentSession.issuedAt,
    expiresAt: nextSession.expiresAt || currentSession.expiresAt,
    expiresInMinutes: nextSession.expiresInMinutes || currentSession.expiresInMinutes,
    pairingPayload: currentSession.pairingPayload || nextSession.pairingPayload,
  }
}

function formatEmergencyErrorMessage(error) {
  const messages = {
    EMERGENCY_DUPLICATE_COOLDOWN:
      '이미 긴급 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
    NO_GUARDIAN: '연결된 보호자가 없습니다. 휴대폰 앱에서 보호자를 먼저 연결해주세요.',
    DELIVERY_FAILED: '보호자에게 알림을 보내지 못했습니다. 잠시 후 다시 시도해주세요.',
    UNAUTHORIZED: '연동 인증이 만료되었습니다. 휴대폰에서 다시 연동해주세요.',
    SERVER_ERROR: '긴급 요청을 보내지 못했습니다. 잠시 후 다시 시도해주세요.',
  }

  return messages[error?.code] || error?.message || messages.SERVER_ERROR
}

export default App
