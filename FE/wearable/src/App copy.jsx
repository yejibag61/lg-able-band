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
const BOTTOM_SHEET_COLLAPSED_PEEK = 34

function App() {
  const [initialPairing] = useState(() => getStoredPairedPairingSession())
  const [isPaired, setIsPaired] = useState(false)
  const [mode, setMode] = useState('alert')
  const [pairingStatus, setPairingStatus] = useState(getInitialPairingStatus())
  const [pairing, setPairing] = useState(null)
  const [isRestoringPairing, setIsRestoringPairing] = useState(Boolean(initialPairing))
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
  const [, setLivingSignalState] = useState({
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
  const uwbSpeechStateRef = useRef({
    utterance: null,
    currentText: '',
    pendingText: '',
  })
  const uwbVibrationIntervalRef = useRef(null)
  const bleGuide = useBleProximityGuide()

  const selectedAlert = alertQueue[alertIndex] || null
  const activeUwbSession = useMemo(
    () => buildActiveGuideSession(bleGuide, uwbSession, selectedGuideTarget),
    [bleGuide, selectedGuideTarget, uwbSession],
  )
  const toastMessage = isGuardianConnectionToast(statusMessage) ? statusMessage : ''
  const inlineStatusMessage = toastMessage ? '' : statusMessage
  const showBottomSheet = isPaired && mode !== 'emergency'
  const screenClassName = [
    isPaired ? 'wearable-screen-with-mode-switch' : '',
    showBottomSheet ? 'wearable-screen-with-bottom-sheet' : '',
  ]
    .filter(Boolean)
    .join(' ')

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

  const speakUwbGuide = useCallback((text) => {
    const trimmedText = String(text || '').trim()
    if (
      !trimmedText ||
      isChatbotOpen ||
      isChatbotSpeaking ||
      typeof window === 'undefined' ||
      window.__ABLE_BAND_CHATBOT_AUDIO_LOCK__ === true ||
      !('speechSynthesis' in window) ||
      typeof window.SpeechSynthesisUtterance !== 'function'
    ) {
      return
    }

    const synthesis = window.speechSynthesis
    const speechState = uwbSpeechStateRef.current

    if (speechState.utterance && synthesis.speaking) {
      speechState.pendingText = trimmedText
      return
    }

    if (!speechState.utterance && synthesis.speaking) {
      synthesis.cancel()
    }

    if (speechState.currentText === trimmedText && !speechState.pendingText) {
      return
    }

    const utterance = new SpeechSynthesisUtterance(trimmedText)
    utterance.lang = 'ko-KR'
    speechState.currentText = trimmedText
    speechState.pendingText = ''
    speechState.utterance = utterance

    const flushPendingText = () => {
      if (uwbSpeechStateRef.current.utterance !== utterance) {
        return
      }

      uwbSpeechStateRef.current.utterance = null
      const nextText = uwbSpeechStateRef.current.pendingText
      uwbSpeechStateRef.current.pendingText = ''

      if (nextText && nextText !== trimmedText) {
        uwbSpeechStateRef.current.currentText = ''
        window.setTimeout(() => {
          speakUwbGuide(nextText)
        }, 60)
      }
    }

    utterance.onend = flushPendingText
    utterance.onerror = flushPendingText
    synthesis.speak(utterance)
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

  useEffect(() => {
    if (!initialPairing) {
      setIsRestoringPairing(false)
      return undefined
    }

    let isMounted = true

    async function restorePairingSession() {
      try {
        const restoredSession = await getPairingSessionStatus(initialPairing)
        if (!isMounted) {
          return
        }

        const nextSession = mergePairingSession(initialPairing, restoredSession)
        if (nextSession.status === 'success') {
          setPairing(nextSession)
          setPairingStatus('success')
          setIsPaired(true)
          setMode('alert')
          setStatusMessage('')
          return
        }

        clearStoredPairedPairingSession()
        setPairing(null)
        setPairingStatus('waiting')
        setIsPaired(false)
      } catch {
        if (!isMounted) {
          return
        }

        clearStoredPairedPairingSession()
        setPairing(null)
        setPairingStatus('waiting')
        setIsPaired(false)
      } finally {
        if (isMounted) {
          setIsRestoringPairing(false)
        }
      }
    }

    restorePairingSession()

    return () => {
      isMounted = false
    }
  }, [initialPairing])

  useEffect(() => {
    if (typeof globalThis !== 'undefined') {
      globalThis.__ABLE_BAND_VIBRATION_ENABLED__ = isPaired
    }

    if (!isPaired && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(0)
    }

    return () => {
      if (typeof globalThis !== 'undefined') {
        globalThis.__ABLE_BAND_VIBRATION_ENABLED__ = false
      }
    }
  }, [isPaired])

  useEffect(
    () => () => {
      window.clearTimeout(pairingPollTimerRef.current)
      window.clearTimeout(pairingCompleteTimerRef.current)
      window.clearInterval(uwbVibrationIntervalRef.current)
      stopLivingSignalMonitoring()
      uwbSpeechStateRef.current.pendingText = ''
      uwbSpeechStateRef.current.currentText = ''
      uwbSpeechStateRef.current.utterance = null
      window.speechSynthesis?.cancel()
    },
    [stopLivingSignalMonitoring],
  )

  useEffect(() => {
    if (!toastMessage) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage((current) => (current === toastMessage ? '' : current))
    }, 2600)

    return () => window.clearTimeout(timeoutId)
  }, [toastMessage])

  useEffect(() => {
    if (isRestoringPairing || isPaired || isTerminalPairingStatus(pairingStatus)) {
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
  }, [completePairing, isPaired, isRestoringPairing, pairingGeneration, pairingStatus])

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
      mode === 'idle' ||
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

    if (mode !== 'alert') {
      return
    }

    if (announcedAlertIdRef.current === selectedAlert.alertId) {
      return
    }

    announcedAlertIdRef.current = selectedAlert.alertId
    triggerVibration(vibrationPatternForAlert(selectedAlert))
    speakText(selectedAlert.voiceGuide || selectedAlert.message)
  }, [mode, selectedAlert, speakText])

  useEffect(() => {
    if (mode !== 'uwb' || !activeUwbSession?.voiceGuide) {
      if (uwbSpeechStateRef.current.utterance && typeof window !== 'undefined') {
        window.speechSynthesis?.cancel?.()
      }
      uwbSpeechStateRef.current.pendingText = ''
      uwbSpeechStateRef.current.currentText = ''
      uwbSpeechStateRef.current.utterance = null
      return
    }

    const voiceKey = `${activeUwbSession.sessionId}:${activeUwbSession.navigationStatus}:${activeUwbSession.voiceGuide}`
    announcedUwbMessageRef.current = voiceKey
    speakUwbGuide(activeUwbSession.voiceGuide)
  }, [activeUwbSession, mode, speakUwbGuide])

  useEffect(() => {
    window.clearInterval(uwbVibrationIntervalRef.current)

    if (!isPaired || mode !== 'uwb' || !activeUwbSession) {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(0)
      }
      return undefined
    }

    const isBleGuideSession = String(activeUwbSession.sessionId || '').startsWith('ble-')
    const isBleDistanceReady = bleGuide.status === 'active' && Number.isFinite(bleGuide.distanceM)
    if (isBleGuideSession && !isBleDistanceReady) {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(0)
      }
      return undefined
    }

    const nextPattern = getRepeatingUwbVibrationPattern(activeUwbSession)
    if (nextPattern === 'NONE') {
      return undefined
    }

    triggerVibration(nextPattern)
    uwbVibrationIntervalRef.current = window.setInterval(() => {
      triggerVibration(nextPattern)
    }, getRepeatingUwbVibrationIntervalMs(nextPattern))

    return () => window.clearInterval(uwbVibrationIntervalRef.current)
  }, [
    activeUwbSession?.distanceM,
    activeUwbSession?.navigationStatus,
    activeUwbSession?.sessionId,
    activeUwbSession?.vibrationPattern,
    bleGuide.distanceM,
    bleGuide.status,
    isPaired,
    mode,
  ])

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

  void handleUnpair

  return (
    <main className="app-root">
      <WearableFrame screenClassName={screenClassName}>
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

        {!isPaired && inlineStatusMessage ? (
          <p className="live-message" role="status">
            {inlineStatusMessage}
          </p>
        ) : null}

        {isPaired && mode === 'alert' ? (
          <CurrentAlertScreen
            alert={selectedAlert}
            alertPage={alertIndex + 1}
            alertTotal={alertQueue.length}
            actionMessage={inlineStatusMessage}
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
            actionMessage={inlineStatusMessage}
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
          <VoiceChatbot
            alert={selectedAlert}
            alertQueue={alertQueue}
            embedded
            isPaired={isPaired}
            mode={mode}
            onOpenChange={setIsChatbotOpen}
            onSpeakingChange={setIsChatbotSpeaking}
            onWakeListeningChange={setIsChatbotWakeListening}
            showFab={false}
            statusMessage={inlineStatusMessage}
            uwbSession={uwbSession}
          />
        ) : null}

        {isPaired && mode === 'deviceSelect' ? (
          <DeviceSelectScreen
            actionMessage={inlineStatusMessage}
            devices={uwbTargets}
            isBusy={isBusy}
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
            actionMessage={inlineStatusMessage}
            isBusy={isBusy}
            onCancel={() => {
              setMode('idle')
              setStatusMessage('')
            }}
            onRequest={handleEmergencyRequest}
          />
        ) : null}

        {isPaired && mode !== 'idle' ? (
          <VoiceChatbot
            alert={selectedAlert}
            alertQueue={alertQueue}
            isPaired={isPaired}
            mode={mode}
            onOpenChange={setIsChatbotOpen}
            onSpeakingChange={setIsChatbotSpeaking}
            onWakeListeningChange={setIsChatbotWakeListening}
            showFab={false}
            statusMessage={inlineStatusMessage}
            uwbSession={uwbSession}
          />
        ) : null}

        {toastMessage ? <WearableToast message={toastMessage} /> : null}

        {showBottomSheet ? (
          <WearableBottomSheet
            isBusy={isBusy}
            onEmergencyRequest={handleEmergencyRequest}
            onUnpair={handleUnpair}
          />
        ) : null}
      </WearableFrame>
    </main>
  )
}

function WearableToast({ message }) {
  return (
    <div className="wearable-toast" aria-live="assertive" role="alert">
      <p className="wearable-toast-message">{message}</p>
    </div>
  )
}

function WearableBottomSheet({ isBusy, onEmergencyRequest, onUnpair }) {
  const sheetRef = useRef(null)
  const dragStateRef = useRef({
    moved: false,
    pointerId: null,
    startTranslate: 0,
    startY: 0,
  })
  const translateRef = useRef(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [travel, setTravel] = useState(0)
  const [translate, setTranslate] = useState(0)

  useEffect(() => {
    translateRef.current = translate
  }, [translate])

  useEffect(() => {
    function syncTravel() {
      const height = sheetRef.current?.offsetHeight || 0
      const nextTravel = Math.max(height - BOTTOM_SHEET_COLLAPSED_PEEK, 0)
      setTravel(nextTravel)
    }

    syncTravel()
    window.addEventListener('resize', syncTravel)

    if (typeof ResizeObserver === 'function' && sheetRef.current) {
      const observer = new ResizeObserver(syncTravel)
      observer.observe(sheetRef.current)
      return () => {
        observer.disconnect()
        window.removeEventListener('resize', syncTravel)
      }
    }

    return () => window.removeEventListener('resize', syncTravel)
  }, [])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setTranslate(isExpanded ? 0 : travel)
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [isExpanded, travel])

  function toggleExpanded() {
    if (dragStateRef.current.moved) {
      dragStateRef.current.moved = false
      return
    }

    setIsExpanded((current) => !current)
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }

    dragStateRef.current = {
      moved: false,
      pointerId: event.pointerId,
      startTranslate: translateRef.current,
      startY: event.clientY,
    }
    setIsDragging(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function handlePointerMove(event) {
    if (!isDragging || dragStateRef.current.pointerId !== event.pointerId) {
      return
    }

    const deltaY = event.clientY - dragStateRef.current.startY
    if (Math.abs(deltaY) > 6) {
      dragStateRef.current.moved = true
    }

    setTranslate(clamp(dragStateRef.current.startTranslate + deltaY, 0, travel))
  }

  function handlePointerEnd(event) {
    if (!isDragging || dragStateRef.current.pointerId !== event.pointerId) {
      return
    }

    const shouldExpand = translateRef.current < travel * 0.55
    setIsDragging(false)
    setIsExpanded(shouldExpand)
    setTranslate(shouldExpand ? 0 : travel)
    dragStateRef.current.pointerId = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return (
    <section
      className={isExpanded ? 'wearable-bottom-sheet is-expanded' : 'wearable-bottom-sheet'}
      ref={sheetRef}
      style={{
        transform: `translateY(${translate}px)`,
        transition: isDragging ? 'none' : undefined,
      }}
    >
      <div
        className="wearable-bottom-sheet-header"
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        <button
          aria-controls="wearable-bottom-sheet-content"
          aria-expanded={isExpanded}
          className="wearable-bottom-sheet-toggle"
          type="button"
          onClick={toggleExpanded}
        >
          <span className="wearable-bottom-sheet-handle" aria-hidden="true" />
        </button>
      </div>

      <div className="wearable-bottom-sheet-body" id="wearable-bottom-sheet-content">
        <div className="wearable-bottom-sheet-actions">
          <button className="primary-action" type="button" disabled={isBusy} onClick={onEmergencyRequest}>
            {isBusy ? '요청 중...' : '긴급 도움 요청'}
          </button>
          <button className="secondary-action" type="button" disabled={isBusy} onClick={onUnpair}>
            연동 해제
          </button>
        </div>
      </div>
    </section>
  )
}

function DeviceSelectScreen({ actionMessage, devices = [], isBusy, onSelect }) {
  const displayDevices = devices

  return (
    <section className="state-screen device-select-screen" aria-label="내 가전 목록">
      <div className="device-select-grid">
        {displayDevices.map((device) => (
          <article className="device-select-card" key={device.deviceId || device.name}>
            <div className="device-select-card-top">
              <span
                className={
                  device.type === 'WASHER'
                    ? `device-select-icon icon-${device.iconTone} is-svg-icon`
                    : `device-select-icon icon-${device.iconTone}`
                }
                aria-hidden="true"
              >
                {renderWearableDeviceIcon(device.type, device.icon)}
              </span>
              <span
                className={`device-status-dot status-${device.statusTone}`}
                aria-label={device.connectionStatus === 'CONNECTED' ? '연결됨' : '연결 안 됨'}
                role="img"
              />
            </div>
            <div className="device-select-copy">
              <div className="device-select-title-row">
                <span className="device-select-name">{device.name}</span>
              </div>
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

function renderWearableDeviceIcon(type, fallbackIcon) {
  if (type === 'WASHER') {
    return (
      <svg viewBox="0 0 48 48" focusable="false">
        <rect x="10" y="7" width="28" height="34" rx="5" />
        <circle cx="24" cy="27" r="9" />
        <path d="M16 14h7M30 14h2" />
      </svg>
    )
  }

  return fallbackIcon
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
    return 'SLOW'
  }

  if (distanceM <= 0.8) {
    return 'LONG_TWICE'
  }

  if (distanceM <= 1.8) {
    return 'FAST'
  }

  if (distanceM <= 3) {
    return 'MEDIUM'
  }

  return 'SLOW'
}

function getRepeatingUwbVibrationPattern(session) {
  if (!session) {
    return 'NONE'
  }

  if (session.navigationStatus === 'FAILED') {
    return 'SLOW'
  }

  if (session.navigationStatus === 'ARRIVED') {
    return 'LONG_TWICE'
  }

  if (session.vibrationPattern && session.vibrationPattern !== 'NONE') {
    return session.vibrationPattern
  }

  return 'SLOW'
}

function getRepeatingUwbVibrationIntervalMs(pattern) {
  const intervals = {
    SLOW: 1800,
    MEDIUM: 1200,
    FAST: 720,
    LONG_TWICE: 1500,
    STRONG: 900,
  }

  return intervals[pattern] || intervals.SLOW
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function isGuardianConnectionToast(message) {
  return typeof message === 'string' && message.includes('연결된 보호자가 없습니다')
}

export default App
