import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBleProximityGuide } from './features/ble/useBleProximityGuide'
import { ModeSwitch } from './components/ModeSwitch'
import { WearableFrame } from './components/WearableFrame'
import { VoiceChatbot } from './components/VoiceChatbot'
import { CurrentAlertScreen } from './features/alerts/CurrentAlertScreen'
import { WearableEmergencyScreen } from './features/emergency/WearableEmergencyScreen'
import {
  createWearableLivingSignalSession,
  isMicrophoneSupported,
} from './features/living-signal/wearableLivingSignalAudio'
import { PairingQrScreen } from './features/pairing/PairingQrScreen'
import { UwbGuideScreen } from './features/uwb/UwbGuideScreen'
import {
  createLivingSignalDetectionAlert,
  getWearableLivingSignalState,
} from './services/livingSignalService'
import { clearWearableAccessToken, getWearableAccessToken } from './services/wearableApiClient'
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
  stopUwbSession,
  unpairWearable,
} from './services/wearableService'
import { triggerVibration, vibrationPatternForAlert } from './services/vibrationService'
import {
  getPairingPollIntervalMs,
  getPairingSuccessTransitionMs,
  getUwbPollIntervalMs,
} from './runtimeTiming'
import './App.css'

const PAIRED_PAIRING_STORAGE_KEY = 'lg-able-band.pairingSession'
const LIVING_SIGNAL_REPORT_COOLDOWN_MS = 15000
const ALERT_POLL_INTERVAL_MS = 3000

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
  const [statusMessage, setStatusMessage] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [isChatbotWakeListening, setIsChatbotWakeListening] = useState(false)
  const [isChatbotOpen, setIsChatbotOpen] = useState(false)
  const [isChatbotSpeaking, setIsChatbotSpeaking] = useState(false)
  const [syncedTime, setSyncedTime] = useState(() => new Date())
  const [selectedGuideTarget, setSelectedGuideTarget] = useState(null)
  const [livingSignalState, setLivingSignalState] = useState({
    isListening: false,
    threshold: 0.8,
    sounds: [],
    level: 0,
    error: '',
    lastMatch: null,
  })

  const isUwbPollingRef = useRef(true)
  const pairingPollTimerRef = useRef(null)
  const pairingCompleteTimerRef = useRef(null)
  const pairingCompletedRef = useRef(false)
  const livingSignalSessionRef = useRef(null)
  const livingSignalCooldownRef = useRef({ key: '', at: 0 })
  const knownAlertIdsRef = useRef(new Set())
  const announcedAlertIdRef = useRef(null)
  const announcedUwbMessageRef = useRef('')
  const bleGuide = useBleProximityGuide()

  const selectedAlert = alertQueue[alertIndex] || null
  const activeUwbSession = useMemo(
    () => buildActiveGuideSession(bleGuide, uwbSession, selectedGuideTarget),
    [bleGuide, selectedGuideTarget, uwbSession],
  )

  const speakText = useCallback((text) => {
    if (
      !text ||
      isChatbotOpen ||
      isChatbotSpeaking ||
      typeof window === 'undefined' ||
      window.__ABLE_BAND_CHATBOT_AUDIO_LOCK__ === true ||
      !('speechSynthesis' in window)
    ) {
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    window.speechSynthesis.speak(utterance)
  }, [isChatbotOpen, isChatbotSpeaking])

  const stopLivingSignalMonitoring = useCallback(async () => {
    const session = livingSignalSessionRef.current
    if (!session) {
      return
    }

    livingSignalSessionRef.current = null
    await session.stop()
    setLivingSignalState((current) => ({
      ...current,
      isListening: false,
      level: 0,
    }))
  }, [])

  const resetPairingSession = useCallback(
    async (message = '') => {
      window.clearTimeout(pairingCompleteTimerRef.current)
      window.clearTimeout(pairingPollTimerRef.current)
      clearWearableAccessToken()
      clearStoredPairedPairingSession()
      pairingCompletedRef.current = false
      isUwbPollingRef.current = true
      await stopLivingSignalMonitoring()
      setIsPaired(false)
      setMode('alert')
      setPairing(null)
      setPairingStatus('waiting')
      setPairingGeneration((current) => current + 1)
      setAlertQueue([])
      setAlertIndex(0)
      setAlertStatuses({})
      knownAlertIdsRef.current = new Set()
      setUwbSession(null)
      setUwbTargets([])
      setSelectedGuideTarget(null)
      setIsUwbTargetLoading(false)
      setIsUwbPolling(true)
      setLivingSignalState({
        isListening: false,
        threshold: 0.8,
        sounds: [],
        level: 0,
        error: '',
        lastMatch: null,
      })
      setStatusMessage(message)
    },
    [stopLivingSignalMonitoring],
  )

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
      stopLivingSignalMonitoring()
      window.speechSynthesis?.cancel()
    },
    [stopLivingSignalMonitoring],
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
    if (!isPaired) {
      return undefined
    }

    let isMounted = true
    let intervalId = null

    async function loadAlert() {
      try {
        const alerts = await getCurrentAlerts()
        if (isMounted) {
          const nextAlerts = alerts
            .map((item) => applyStoredAlertStatus(item, alertStatuses))
            .filter((item) => item.status !== 'CONFIRMED')
          const hasNewAlert = nextAlerts.some((item) => !knownAlertIdsRef.current.has(item.alertId))
          knownAlertIdsRef.current = new Set(nextAlerts.map((item) => item.alertId))
          setAlertQueue(nextAlerts)
          setAlertIndex((current) => Math.min(current, Math.max(nextAlerts.length - 1, 0)))

          if (hasNewAlert && nextAlerts.length > 0 && mode === 'idle') {
            setMode('alert')
          }
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
    intervalId = window.setInterval(loadAlert, ALERT_POLL_INTERVAL_MS)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [alertStatuses, isPaired, mode, resetPairingSession])

  useEffect(() => {
    if (
      !isPaired ||
      isChatbotWakeListening ||
      isChatbotOpen ||
      isChatbotSpeaking ||
      mode === 'uwb' ||
      mode === 'emergency'
    ) {
      stopLivingSignalMonitoring()
      return undefined
    }

    if (!isMicrophoneSupported()) {
      setLivingSignalState((current) => ({
        ...current,
        isListening: false,
        error: '이 브라우저에서는 웨어러블 마이크 상시 감지를 사용할 수 없습니다.',
      }))
      return undefined
    }

    let isMounted = true

    async function startMonitoring() {
      try {
        const state = await getWearableLivingSignalState()
        if (!isMounted) {
          return
        }

        setLivingSignalState((current) => ({
          ...current,
          threshold: state.threshold ?? 0.8,
          sounds: state.sounds || [],
          error: '',
        }))

        if (!state.sounds?.length) {
          return
        }

        const session = await createWearableLivingSignalSession({
          sounds: state.sounds,
          threshold: state.threshold ?? 0.8,
          onLevel: (level) => {
            if (!isMounted) {
              return
            }

            setLivingSignalState((current) => ({
              ...current,
              isListening: true,
              level,
            }))
          },
          onMatch: async (match) => {
            if (!match?.predicted || !isMounted) {
              return
            }

            const detectionKey = `${match.soundId}:${match.soundType}`
            const now = Date.now()
            if (
              livingSignalCooldownRef.current.key === detectionKey &&
              now - livingSignalCooldownRef.current.at < LIVING_SIGNAL_REPORT_COOLDOWN_MS
            ) {
              return
            }

            livingSignalCooldownRef.current = {
              key: detectionKey,
              at: now,
            }

            try {
              const createdAlert = await createLivingSignalDetectionAlert({
                registeredSoundName: match.registeredSoundName,
                soundType: match.soundType,
                similarity: Number(match.similarity.toFixed(4)),
                detectedAt: match.detectedAt,
              })

              if (!isMounted) {
                return
              }

              announcedAlertIdRef.current = createdAlert.alertId
              setLivingSignalState((current) => ({
                ...current,
                lastMatch: match,
                error: '',
              }))
              setAlertQueue((current) => [createdAlert, ...current.filter((item) => item.alertId !== createdAlert.alertId)])
              setAlertIndex(0)
              setMode('alert')
              setStatusMessage(`${match.registeredSoundName} 감지`)
              triggerVibration(vibrationPatternForAlert(createdAlert))
              speakText(createdAlert.voiceGuide || createdAlert.message)
            } catch (error) {
              if (!isMounted) {
                return
              }

              setLivingSignalState((current) => ({
                ...current,
                error: error.message || '생활 신호 감지 알림 생성에 실패했습니다.',
              }))
            }
          },
        })

        livingSignalSessionRef.current = session
        setLivingSignalState((current) => ({
          ...current,
          isListening: true,
          error: '',
        }))
      } catch (error) {
        if (!isMounted) {
          return
        }

        setLivingSignalState((current) => ({
          ...current,
          isListening: false,
          error: error.message || '생활 신호 감지를 시작하지 못했습니다.',
        }))
      }
    }

    startMonitoring()

    return () => {
      isMounted = false
      stopLivingSignalMonitoring()
    }
  }, [isChatbotOpen, isChatbotSpeaking, isChatbotWakeListening, isPaired, mode, speakText, stopLivingSignalMonitoring])

  useEffect(() => {
    if (!selectedAlert?.alertId) {
      return
    }

    if (announcedAlertIdRef.current === selectedAlert.alertId) {
      return
    }

    announcedAlertIdRef.current = selectedAlert.alertId
    triggerVibration(vibrationPatternForAlert(selectedAlert))
    speakText(selectedAlert.voiceGuide || selectedAlert.message)
  }, [selectedAlert, speakText])

  useEffect(() => {
    if (mode !== 'uwb' || !activeUwbSession?.voiceGuide) {
      return
    }

    const voiceKey = `${activeUwbSession.sessionId}:${activeUwbSession.navigationStatus}:${activeUwbSession.voiceGuide}`
    if (announcedUwbMessageRef.current === voiceKey) {
      return
    }

    announcedUwbMessageRef.current = voiceKey
    speakText(activeUwbSession.voiceGuide)
  }, [activeUwbSession, mode, speakText])

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
      setStatusMessage('확인한 알림을 정리했습니다.')
    } catch {
      setStatusMessage('확인 처리에 실패했습니다.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleStopUwb(sessionId) {
    if (bleGuide.isActive || bleGuide.isConnecting || selectedGuideTarget) {
      setIsBusy(true)
      try {
        await bleGuide.stopGuide()
        setSelectedGuideTarget(null)
        setUwbSession(null)
        setMode('deviceSelect')
        setStatusMessage('위치 안내를 종료했습니다. 다른 가전을 선택할 수 있습니다.')
      } catch {
        setStatusMessage('안내 종료에 실패했습니다.')
      } finally {
        setIsBusy(false)
      }
      return
    }

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
      setStatusMessage('위치 안내를 종료했습니다. 다른 가전을 선택할 수 있습니다.')
    } catch {
      setStatusMessage('안내 종료에 실패했습니다.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleEmergencyRequest() {
    setIsBusy(true)
    setStatusMessage('긴급 요청을 보내는 중입니다.')
    try {
      const response = await requestEmergencyHelp('웨어러블에서 긴급 요청')
      triggerVibration('LONG_TWICE')
      setStatusMessage(
        response.message
          ? `${response.message} 보호자에게도 확인 요청을 전달했습니다.`
          : '보호자에게 긴급 요청을 보냈습니다. 보호자에게도 확인 요청을 전달했습니다.',
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
      await resetPairingSession('연결을 해제했습니다.')
    } catch {
      setStatusMessage('연동 해제에 실패했습니다.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="app-root">
      <WearableFrame screenClassName={isPaired ? 'wearable-screen-with-mode-switch' : ''}>
        {isPaired ? (
          <ModeSwitch
            activeMode={mode === 'deviceSelect' ? 'uwb' : mode}
            onModeChange={(nextMode) => {
              setStatusMessage('')
              if (mode === 'uwb' && nextMode !== 'uwb') {
                void bleGuide.stopGuide()
                setSelectedGuideTarget(null)
                setUwbSession(null)
              }
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
            session={activeUwbSession}
            actionMessage={statusMessage}
            isBusy={isBusy}
            onStandby={() => {
              void bleGuide.stopGuide()
              setSelectedGuideTarget(null)
              setMode('idle')
              setStatusMessage('')
            }}
            onStop={handleStopUwb}
          />
        ) : null}

        {isPaired && mode === 'idle' ? (
          <section className="state-screen standby-screen" aria-label="웨어러블 대기">
            <p className="eyebrow">Able Band</p>
            <h1>웨어러블에서 대기 중</h1>
            <p>생활 신호 감지와 위치 안내가 시작되면 바로 표시됩니다.</p>
            <dl className="standby-meta">
              <div>
                <dt>마이크 감지</dt>
                <dd>{isChatbotOpen ? '챗봇 사용 중' : isChatbotWakeListening ? '챗봇 대기 중' : livingSignalState.isListening ? '실행 중' : '준비 중'}</dd>
              </div>
              <div>
                <dt>연동</dt>
                <dd>앱과 연결됨</dd>
              </div>
            </dl>
            <div className="action-row">
              <button className="primary-action" type="button" onClick={() => setMode('emergency')}>
                긴급 요청
              </button>
              <button className="secondary-action" disabled={isBusy} type="button" onClick={handleUnpair}>
                연동 해제
              </button>
            </div>
          </section>
        ) : null}

        {isPaired && mode === 'deviceSelect' ? (
          <DeviceSelectScreen
            actionMessage={statusMessage}
            devices={uwbTargets}
            isBusy={isBusy}
            isLoading={isUwbTargetLoading}
            onSelect={async (device) => {
              setIsBusy(true)
              setSelectedGuideTarget(device)
              setMode('uwb')
              setStatusMessage('')
              isUwbPollingRef.current = false
              setIsUwbPolling(false)
              setUwbSession(null)
              try {
                await bleGuide.startGuide(device.name)
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

        <VoiceChatbot
          alert={selectedAlert}
          alertQueue={alertQueue}
          isPaired={isPaired}
          mode={isPaired ? mode : 'pairing'}
          onOpenChange={setIsChatbotOpen}
          onSpeakingChange={setIsChatbotSpeaking}
          onWakeListeningChange={setIsChatbotWakeListening}
          statusMessage={statusMessage}
          uwbSession={uwbSession}
        />
      </WearableFrame>
    </main>
  )
}

function DeviceSelectScreen({ actionMessage, devices = [], isBusy, isLoading, onSelect }) {
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
      <p className="device-select-description">
        위치 안내를 시작하면 블루투스 기기 선택창이 열립니다. `ABLE-ESP` 기기를 선택해 주세요.
      </p>
      <div className="device-select-grid">
        {displayDevices.map((device) => (
          <article className="device-select-card" key={device.deviceId || device.name}>
            <div className="device-select-card-top">
              <span className={`device-select-icon icon-${device.iconTone}`} aria-hidden="true">
                {device.icon}
              </span>
              <span className={`device-status-dot status-${device.statusTone}`} aria-hidden="true" />
            </div>
            <div className="device-select-copy">
              <span className="device-select-name">{device.name}</span>
              <span className="device-select-status">{device.status}</span>
            </div>
            <button
              className="primary-action device-select-action"
              type="button"
              disabled={isBusy}
              onClick={() => onSelect(device)}
            >
              {isBusy ? '연결 중...' : '위치 안내 시작'}
            </button>
          </article>
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
    EMERGENCY_DUPLICATE_COOLDOWN: '이미 긴급 요청을 보냈습니다. 잠시 뒤 다시 시도해 주세요.',
    NO_GUARDIAN: '연결된 보호자가 없습니다. 앱에서 보호자를 먼저 연결해 주세요.',
    DELIVERY_FAILED: '보호자에게 알림을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    UNAUTHORIZED: '연동 인증이 만료되었습니다. 앱에서 다시 연동해 주세요.',
    SERVER_ERROR: '긴급 요청을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  }

  return messages[error?.code] || error?.message || messages.SERVER_ERROR
}

function buildActiveGuideSession(bleGuide, uwbSession, selectedGuideTarget) {
  if (selectedGuideTarget || bleGuide.targetName || bleGuide.status !== 'idle') {
    const distanceM = Number.isFinite(bleGuide.distanceM) ? Number(bleGuide.distanceM.toFixed(1)) : 0
    const guideStatus = mapBleGuideStatusToNavigation(bleGuide.status, bleGuide.distanceM)

    return {
      sessionId: `ble-${selectedGuideTarget?.deviceId || bleGuide.targetName || 'guide'}`,
      targetDeviceName: selectedGuideTarget?.name || bleGuide.targetName || '가전',
      distanceM,
      confidence: bleGuide.status === 'error' ? 0.2 : distanceM > 0 ? 0.92 : 0.6,
      navigationStatus: guideStatus,
      voiceGuide: bleGuide.helperText || '위치 안내를 준비하고 있어요.',
      vibrationPattern: vibrationPatternForBleDistance(bleGuide.distanceM),
      locationName: selectedGuideTarget?.locationName || selectedGuideTarget?.roomName || '집 안',
      updatedAt: new Date().toISOString(),
    }
  }

  return uwbSession
}

function mapBleGuideStatusToNavigation(status, distanceM) {
  if (status === 'error') {
    return 'FAILED'
  }

  if (Number.isFinite(distanceM) && distanceM <= 1) {
    return 'ARRIVED'
  }

  if (status === 'selecting' || status === 'connecting' || status === 'active') {
    return 'ACTIVE'
  }

  return 'READY'
}

function vibrationPatternForBleDistance(distanceM) {
  if (!Number.isFinite(distanceM)) {
    return 'NONE'
  }

  if (distanceM <= 1) {
    return 'LONG_TWICE'
  }

  if (distanceM <= 3) {
    return 'MEDIUM'
  }

  return 'SLOW'
}

export default App
