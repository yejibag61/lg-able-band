import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatbotFeatureSelect } from './ChatbotFeatureSelect'
import { SpeakForMeScreen } from './SpeakForMeScreen'
import { CHATBOT_QUESTION_CATEGORIES, FALLBACK_CHAT_ALERTS } from '../data/chatbotRecommendations'
import { createDevice, getDevices } from '../services/deviceService'
import { createEmergencyRequest } from '../services/emergencyService'
import { linkGuardianByEmail } from '../services/guardianService'
import {
  startChatbotWakeService,
  stopChatbotWakeService,
  subscribeChatbotWake,
} from '../services/chatbotWakeService'
import {
  playGreetingAudio,
  playTurnCueTone,
  stopTurnCueAudio,
  unlockTurnCueAudio,
} from '../services/turnCueAudioService'
import { handleStructuredVoiceCommand } from '../services/voiceIntentEngine'
import { requestVoiceChat } from '../services/voiceChatbotService'
import { normalizeSpeechText, shouldCloseChatbot, shouldOpenChatbot } from '../utils/chatbotWake'

export { shouldOpenChatbot } from '../utils/chatbotWake'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
export const CHATBOT_INTERRUPT_EVENT = 'lg-able-band:interrupt-chatbot'

const CHATBOT_VOICE_STATE = {
  CLOSED: 'CLOSED',
  OPENING: 'OPENING',
  SPEAKING: 'SPEAKING',
  BEEPING: 'BEEPING',
  LISTENING: 'LISTENING',
  THINKING: 'THINKING',
  INTERRUPTED: 'INTERRUPTED',
  CLOSING: 'CLOSING',
  ERROR: 'ERROR',
}

const UNCLEAR_SPEECH_GUIDE =
  '말씀하신 내용을 이해하지 못했어요. 미확인 알림, 위험 알림, 최근 알림, 세탁기 상태처럼 물어봐 주세요.'
const RECOGNITION_RETRY_GUIDE = '말씀을 정확히 인식하지 못했습니다. 다시 말씀해주세요.'
const RECOGNITION_REPEAT_FAILURE_GUIDE =
  '계속 인식이 어렵습니다. 화면의 입력창에 직접 입력하거나 다시 시도할 수 있습니다.'
const CLOSE_CHATBOT_GUIDE = '챗봇을 종료할게요.'

const locationGuideSteps = [
  {
    distanceText: '약 2미터',
    directionText: '앞쪽',
    guideText: '천천히 앞으로 이동해주세요.',
  },
  {
    distanceText: '약 1미터',
    directionText: '',
    guideText: '오른쪽으로 조금 이동해주세요.',
  },
  {
    distanceText: '약 40센티미터',
    directionText: '앞',
    guideText: '손을 뻗기 전에 주변을 확인해주세요.',
  },
]
const deviceVoiceCatalog = [
  {
    aliases: ['세탁기', '빨래'],
    defaultName: '세탁기',
    defaultVendorDeviceId: 'thinq-washer-001',
    locationSupported: true,
    remoteEnabled: true,
    type: 'WASHER',
    typeLabel: '세탁기',
  },
  {
    aliases: ['티비', 'tv', '텔레비전'],
    defaultName: 'TV',
    defaultVendorDeviceId: 'thinq-tv-001',
    locationSupported: false,
    remoteEnabled: true,
    type: 'TV',
    typeLabel: 'TV',
  },
  {
    aliases: ['전기레인지', '안전 전기레인지', '인덕션', '가스레인지'],
    defaultName: '안전 전기레인지',
    defaultVendorDeviceId: 'thinq-range-001',
    locationSupported: false,
    remoteEnabled: false,
    type: 'RANGE',
    typeLabel: '전기레인지',
  },
  {
    aliases: ['도어센서', '도어 센서', '문 센서', '현관문 센서'],
    defaultName: '도어센서',
    defaultVendorDeviceId: 'thinq-door-001',
    locationSupported: false,
    remoteEnabled: false,
    type: 'DOOR_SENSOR',
    typeLabel: '도어센서',
  },
  {
    aliases: ['공기질 센서', '공기 센서', '공기청정 센서'],
    defaultName: 'LG 공기질 센서',
    defaultVendorDeviceId: 'thinq-air-001',
    locationSupported: true,
    remoteEnabled: false,
    type: 'AIR_SENSOR',
    typeLabel: '공기질 센서',
  },
  {
    aliases: ['냉장고', '냉장실'],
    defaultName: '냉장고',
    defaultVendorDeviceId: 'thinq-fridge-001',
    locationSupported: false,
    remoteEnabled: true,
    type: 'REFRIGERATOR',
    typeLabel: '냉장고',
  },
]

export function VoiceChatbot({
  embedded = false,
  initialOpen = false,
  initialQuestionCategoryId = null,
  onClose,
  preview,
  session,
  summary,
}) {
  const [isOpen, setIsOpen] = useState(embedded || initialOpen)
  const [assistantMode, setAssistantMode] = useState(initialOpen ? 'talk' : 'select')
  const [isListening, setIsListening] = useState(false)
  const [inputText, setInputText] = useState('')
  const [status, setStatus] = useState('대기 중')
  const [response, setResponse] = useState(null)
  const [followupPromptResponse, setFollowupPromptResponse] = useState(null)
  const [messages, setMessages] = useState([])
  const [error, setError] = useState('')
  const [isRequesting, setIsRequesting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [selectedQuestionCategoryId, setSelectedQuestionCategoryId] = useState(initialQuestionCategoryId)
  const [turnCueEnabled, setTurnCueEnabled] = useState(true)
  const [voiceState, setVoiceState] = useState(
    initialOpen ? CHATBOT_VOICE_STATE.OPENING : CHATBOT_VOICE_STATE.CLOSED,
  )
  const recognitionRef = useRef(null)
  const wakeRecognitionRef = useRef(null)
  const latestTranscriptRef = useRef('')
  const sentTranscriptRef = useRef('')
  const conversationActiveRef = useRef(false)
  const manualStopRef = useRef(false)
  const isOpenRef = useRef(false)
  const wakeListeningRef = useRef(false)
  const wakeRestartTimeoutRef = useRef(null)
  const recognitionStartingRef = useRef(false)
  const recognitionListeningRef = useRef(false)
  const recognitionStartTimeoutRef = useRef(null)
  const conversationEndRef = useRef(null)
  const requestInFlightRef = useRef(false)
  const lastInfoAgentRef = useRef(null)
  const chatResetVersionRef = useRef(0)
  const greetingTimeoutRef = useRef(null)
  const speechEndTimeoutRef = useRef(null)
  const speechStartTimeoutRef = useRef(null)
  const speechStartDelayTimeoutRef = useRef(null)
  const speechRetryTimeoutRef = useRef(null)
  const turnCueTimeoutRef = useRef(null)
  const spokenBotMessageIdsRef = useRef(new Set())
  const appFlowRef = useRef(null)
  const voiceStateRef = useRef(initialOpen ? CHATBOT_VOICE_STATE.OPENING : CHATBOT_VOICE_STATE.CLOSED)
  const audioStopVersionRef = useRef(0)
  const recognitionFailureCountRef = useRef(0)

  const supportsSpeechRecognition = Boolean(SpeechRecognition)
  const chatbotContext = useMemo(() => createChatbotContext(summary, preview), [preview, summary])
  const hasFollowupPrompts = Boolean(followupPromptResponse?.infoCard)
  const selectedQuestionCategory = CHATBOT_QUESTION_CATEGORIES.find(
    (category) => category.id === selectedQuestionCategoryId,
  )

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [embedded, isOpen])

  useEffect(() => {
    if (embedded) {
      isOpenRef.current = true
      conversationActiveRef.current = true
    }

    return () => {
      wakeListeningRef.current = false
      window.clearTimeout(wakeRestartTimeoutRef.current)
      window.clearTimeout(greetingTimeoutRef.current)
      window.clearTimeout(recognitionStartTimeoutRef.current)
      window.clearTimeout(speechEndTimeoutRef.current)
      window.clearTimeout(speechStartTimeoutRef.current)
      window.clearTimeout(speechStartDelayTimeoutRef.current)
      window.clearTimeout(speechRetryTimeoutRef.current)
      window.clearTimeout(turnCueTimeoutRef.current)
      wakeRecognitionRef.current?.stop()
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
      stopTurnCueAudio()
    }
  }, [embedded])

  useEffect(() => {
    if (embedded) {
      return undefined
    }

    const unsubscribeWake = subscribeChatbotWake(() => {
      if (!isOpenRef.current) {
        openChatbot({ fromWake: true })
      }
    })

    function restartWakeListening() {
      if (!isOpenRef.current) {
        scheduleWakeListening(120)
      }
    }

    document.addEventListener('visibilitychange', restartWakeListening)
    window.addEventListener('focus', restartWakeListening)
    window.addEventListener('pageshow', restartWakeListening)

    return () => {
      unsubscribeWake()
      document.removeEventListener('visibilitychange', restartWakeListening)
      window.removeEventListener('focus', restartWakeListening)
      window.removeEventListener('pageshow', restartWakeListening)
    }
  }, [embedded])

  useEffect(() => {
    if (typeof conversationEndRef.current?.scrollIntoView === 'function') {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, isListening, status])

  useEffect(() => {
    function handleExternalInterrupt() {
      if (!isOpenRef.current) {
        stopChatbotAudioAndTimers()
        stopActiveRecognition()
        return
      }

      runChatbotButtonAction(closeChatbot)
    }

    window.addEventListener(CHATBOT_INTERRUPT_EVENT, handleExternalInterrupt)
    return () => {
      window.removeEventListener(CHATBOT_INTERRUPT_EVENT, handleExternalInterrupt)
    }
  }, [])

  useEffect(() => {
    if (assistantMode !== 'talk' || !conversationActiveRef.current || manualStopRef.current) {
      return
    }

    const nextMessageToSpeak = [...messages]
      .reverse()
      .find((message) => (
        message.role === 'bot'
        && !message.pending
        && message.text
        && !spokenBotMessageIdsRef.current.has(message.id)
      ))

    if (!nextMessageToSpeak) {
      return
    }

    spokenBotMessageIdsRef.current.add(nextMessageToSpeak.id)
    setStatus('응답 중...')
    speakAndCueUserTurn(getBotMessageVoiceText(nextMessageToSpeak, chatbotContext), () => {
      setStatus('응답 완료')
    })
  }, [assistantMode, chatbotContext, messages])

  function setChatbotVoiceState(nextState) {
    voiceStateRef.current = nextState
    setVoiceState(nextState)
  }

  function openAssistant() {
    isOpenRef.current = true
    stopWakeListening()
    unlockTurnCueAudio()
    conversationActiveRef.current = false
    manualStopRef.current = false
    setChatbotVoiceState(CHATBOT_VOICE_STATE.CLOSED)
    setAssistantMode(embedded ? 'talk' : 'select')
    setIsOpen(true)
    setError('')
    setStatus('대기 중')
  }

  function openChatbot(options = {}) {
    isOpenRef.current = true
    stopWakeListening()
    unlockTurnCueAudio()
    conversationActiveRef.current = true
    manualStopRef.current = false
    recognitionFailureCountRef.current = 0
    setChatbotVoiceState(CHATBOT_VOICE_STATE.OPENING)
    setAssistantMode('talk')
    setSelectedQuestionCategoryId(null)
    setIsOpen(true)
    setError('')
    setStatus('안내 중...')
    window.clearTimeout(greetingTimeoutRef.current)
    const greetingDelayMs = options.fromWake ? 650 : 0
    greetingTimeoutRef.current = window.setTimeout(() => {
      if (!conversationActiveRef.current || manualStopRef.current) {
        return
      }

      speakGreetingAndCueUserTurn()
    }, greetingDelayMs)
  }

  function stopChatbotAudioAndTimers() {
    audioStopVersionRef.current += 1
    window.clearTimeout(recognitionStartTimeoutRef.current)
    window.clearTimeout(greetingTimeoutRef.current)
    window.clearTimeout(speechEndTimeoutRef.current)
    window.clearTimeout(speechStartTimeoutRef.current)
    window.clearTimeout(speechStartDelayTimeoutRef.current)
    window.clearTimeout(speechRetryTimeoutRef.current)
    window.clearTimeout(turnCueTimeoutRef.current)
    stopTurnCueAudio()
    try {
      window.speechSynthesis?.cancel?.()
    } catch {
      // Speech synthesis can be unavailable while the browser changes audio focus.
    }
  }

  function stopActiveRecognition() {
    try {
      recognitionRef.current?.abort?.()
    } catch {
      // The recognizer may already be stopped between turns.
    }

    try {
      recognitionRef.current?.stop?.()
    } catch {
      // The recognizer may already be stopped between turns.
    }
  }

  function runChatbotButtonAction(action, options = {}) {
    const { stopRecognition = true } = options

    setChatbotVoiceState(CHATBOT_VOICE_STATE.INTERRUPTED)
    if (requestInFlightRef.current) {
      chatResetVersionRef.current += 1
      requestInFlightRef.current = false
      setIsRequesting(false)
    }
    stopChatbotAudioAndTimers()
    if (stopRecognition) {
      recognitionStartingRef.current = false
      recognitionListeningRef.current = false
      stopActiveRecognition()
      setIsListening(false)
    }

    action?.()
  }

  function closeChatbot() {
    isOpenRef.current = false
    conversationActiveRef.current = false
    manualStopRef.current = true
    setChatbotVoiceState(CHATBOT_VOICE_STATE.CLOSED)
    recognitionStartingRef.current = false
    recognitionListeningRef.current = false
    stopChatbotAudioAndTimers()
    stopActiveRecognition()
    setIsListening(false)
    setStatus('대화 종료')
    setAssistantMode('select')
    setShowResetConfirm(false)
    setSelectedQuestionCategoryId(null)
    if (embedded) {
      onClose?.()
    } else {
      setIsOpen(false)
      window.setTimeout(() => {
        if (!isOpenRef.current) {
          startChatbotWakeService()
        }
      }, 500)
    }
  }

  function returnToFeatureSelect() {
    chatResetVersionRef.current += 1
    conversationActiveRef.current = false
    manualStopRef.current = true
    setChatbotVoiceState(CHATBOT_VOICE_STATE.CLOSED)
    recognitionStartingRef.current = false
    recognitionListeningRef.current = false
    requestInFlightRef.current = false
    latestTranscriptRef.current = ''
    sentTranscriptRef.current = ''
    appFlowRef.current = null
    stopChatbotAudioAndTimers()
    stopActiveRecognition()
    setIsListening(false)
    setIsRequesting(false)
    setStatus('대기 중')
    setAssistantMode('select')
    setShowResetConfirm(false)
    setSelectedQuestionCategoryId(null)
  }

  function resetChat() {
    const shouldRestartConversation = assistantMode === 'talk' && isOpenRef.current
    chatResetVersionRef.current += 1
    conversationActiveRef.current = false
    manualStopRef.current = true
    setChatbotVoiceState(CHATBOT_VOICE_STATE.CLOSED)
    recognitionStartingRef.current = false
    recognitionListeningRef.current = false
    requestInFlightRef.current = false
    latestTranscriptRef.current = ''
    sentTranscriptRef.current = ''
    lastInfoAgentRef.current = null
    appFlowRef.current = null
    spokenBotMessageIdsRef.current.clear()
    stopChatbotAudioAndTimers()
    stopActiveRecognition()

    setMessages([])
    setInputText('')
    setResponse(null)
    setFollowupPromptResponse(null)
    setError('')
    setIsListening(false)
    setIsRequesting(false)
    setStatus('대기 중')
    setShowResetConfirm(false)
    setSelectedQuestionCategoryId(null)

    if (shouldRestartConversation) {
      conversationActiveRef.current = true
      manualStopRef.current = false
      recognitionFailureCountRef.current = 0
      setChatbotVoiceState(CHATBOT_VOICE_STATE.OPENING)
      setStatus('안내 중...')
      window.clearTimeout(greetingTimeoutRef.current)
      greetingTimeoutRef.current = window.setTimeout(() => {
        if (conversationActiveRef.current && !manualStopRef.current) {
          speakGreetingAndCueUserTurn()
        }
      }, 0)
    }
  }

  function ensureWakeRecognition() {
    if (!SpeechRecognition) {
      return null
    }

    if (wakeRecognitionRef.current) {
      return wakeRecognitionRef.current
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')

      if (shouldOpenChatbot(transcript)) {
        wakeListeningRef.current = false
        recognition.abort?.()
        openChatbot()
        return
      }
    }

    recognition.onerror = (event) => {
      wakeListeningRef.current = false

      if (!isOpenRef.current && !['not-allowed', 'service-not-allowed'].includes(event.error)) {
        scheduleWakeListening(700)
      }
    }

    recognition.onend = () => {
      wakeListeningRef.current = false

      if (!isOpenRef.current) {
        scheduleWakeListening(300)
      }
    }

    wakeRecognitionRef.current = recognition
    return recognition
  }

  function startWakeListening() {
    if (isOpenRef.current) {
      return
    }

    startChatbotWakeService()
  }

  function scheduleWakeListening(delayMs) {
    window.clearTimeout(wakeRestartTimeoutRef.current)
    wakeRestartTimeoutRef.current = window.setTimeout(() => {
      startWakeListening()
    }, delayMs)
  }

  function stopWakeListening() {
    const wasListening = wakeListeningRef.current
    wakeListeningRef.current = false
    window.clearTimeout(wakeRestartTimeoutRef.current)
    stopChatbotWakeService()
    wakeRecognitionRef.current?.abort?.()
    return wasListening
  }

  function ensureRecognition() {
    if (!SpeechRecognition) {
      return null
    }

    if (recognitionRef.current) {
      return recognitionRef.current
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onstart = () => {
      window.clearTimeout(recognitionStartTimeoutRef.current)
      recognitionStartingRef.current = false
      recognitionListeningRef.current = true
      latestTranscriptRef.current = ''
      sentTranscriptRef.current = ''
      manualStopRef.current = false
      setChatbotVoiceState(CHATBOT_VOICE_STATE.LISTENING)
      setIsListening(true)
      setStatus('듣는 중...')
      setError('')
    }

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')

      setInputText(transcript)
      latestTranscriptRef.current = transcript

      const lastResult = event.results[event.results.length - 1]
      if (lastResult.isFinal) {
        recognitionFailureCountRef.current = 0
        recognitionListeningRef.current = false
        setIsListening(false)
        setStatus('음성 인식 완료')
        try {
          recognition.stop?.()
        } catch {
          // Recognition may already be stopping after the final transcript.
        }
        sendRecognizedText(transcript)
      }
    }

    recognition.onerror = (event) => {
      window.clearTimeout(recognitionStartTimeoutRef.current)
      recognitionStartingRef.current = false
      recognitionListeningRef.current = false
      setIsListening(false)

      if (!conversationActiveRef.current || manualStopRef.current) {
        return
      }

      setError(speechRecognitionErrorMessage(event.error))

      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
        setStatus('음성 인식 사용 불가')
        conversationActiveRef.current = false
        return
      }

      if (event.error === 'no-speech') {
        handleRecognitionFailure(RECOGNITION_RETRY_GUIDE)
        return
      }

      setChatbotVoiceState(CHATBOT_VOICE_STATE.ERROR)
      setStatus('음성 인식 오류')
    }

    recognition.onend = () => {
      window.clearTimeout(recognitionStartTimeoutRef.current)
      recognitionStartingRef.current = false
      recognitionListeningRef.current = false
      setIsListening(false)

      if (!conversationActiveRef.current || manualStopRef.current) {
        return
      }

      const transcript = latestTranscriptRef.current.trim()
      if (transcript) {
        sendRecognizedText(transcript)
        return
      }

      if (voiceStateRef.current === CHATBOT_VOICE_STATE.LISTENING) {
        handleRecognitionFailure(RECOGNITION_RETRY_GUIDE)
        return
      }

      setStatus('음성 입력 대기')
    }

    recognitionRef.current = recognition
    return recognition
  }

  function startListening() {
    if (
      !conversationActiveRef.current
      || recognitionStartingRef.current
      || recognitionListeningRef.current
      || voiceStateRef.current === CHATBOT_VOICE_STATE.SPEAKING
      || voiceStateRef.current === CHATBOT_VOICE_STATE.BEEPING
      || voiceStateRef.current === CHATBOT_VOICE_STATE.THINKING
      || voiceStateRef.current === CHATBOT_VOICE_STATE.CLOSING
    ) {
      return
    }

    const recognition = ensureRecognition()
    if (!recognition) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge에서 localhost로 접속해 주세요.')
      setStatus('음성 인식 미지원')
      return
    }

    const wakeWasListening = stopWakeListening()
    recognitionStartingRef.current = true
    setChatbotVoiceState(CHATBOT_VOICE_STATE.LISTENING)
    setStatus('마이크 연결 중...')
    setError('')

    const beginRecognition = () => {
      if (!conversationActiveRef.current || !recognitionStartingRef.current) {
        recognitionStartingRef.current = false
        return
      }

      try {
        recognition.start()
        recognitionStartTimeoutRef.current = window.setTimeout(() => {
          if (!recognitionStartingRef.current) {
            return
          }
          recognitionStartingRef.current = false
          recognition.abort()
          setError('마이크 연결 시간이 초과되었습니다. 마이크 권한과 네트워크를 확인해 주세요.')
          setStatus('마이크 연결 실패')
        }, 5000)
      } catch (recognitionError) {
        recognitionStartingRef.current = false
        if (recognitionError?.name !== 'InvalidStateError') {
          setError('마이크를 시작하지 못했습니다. 브라우저의 마이크 권한을 확인해 주세요.')
          setStatus('음성 인식 시작 실패')
        }
      }
    }

    if (wakeWasListening) {
      window.setTimeout(beginRecognition, 180)
    } else {
      beginRecognition()
    }
  }

  function stopListening() {
    manualStopRef.current = true
    recognitionStartingRef.current = false
    recognitionListeningRef.current = false
    window.clearTimeout(recognitionStartTimeoutRef.current)
    recognitionRef.current?.stop()
    setIsListening(false)
    if (voiceStateRef.current === CHATBOT_VOICE_STATE.LISTENING) {
      setChatbotVoiceState(CHATBOT_VOICE_STATE.INTERRUPTED)
    }
    setStatus('일시 정지')
  }

  async function handleAppVoiceCommand(text, displayText, continueConversation) {
    const flow = appFlowRef.current
    if (!flow || flow.currentIntent) {
      const structuredResult = await handleStructuredVoiceCommand({
        currentTask: flow?.currentIntent ? flow : null,
        text,
        context: {
          preview,
          summary,
          session,
          deviceCatalog: deviceVoiceCatalog,
        },
      })

      if (structuredResult.handled) {
        appFlowRef.current = structuredResult.nextTask || null
        respondWithLocalAssistant(
          displayText,
          structuredResult.responseText,
          continueConversation,
          createStructuredResponseData(structuredResult, text),
        )
        return true
      }
    }

    if (flow) {
      return continueAppFlow(flow, text, displayText, continueConversation)
    }

    if (isDeviceAddCommand(text)) {
      return startDeviceAddFlow(text, displayText, continueConversation)
    }

    if (isLocationGuideCommand(text)) {
      return startLocationGuideFlow(text, displayText, continueConversation)
    }

    if (isGuardianConnectCommand(text)) {
      appFlowRef.current = { type: 'guardianConnect', step: 'email' }
      respondWithLocalAssistant(
        displayText,
        '보호자를 연결할게요. 보호자 이메일을 말씀해 주세요.',
        continueConversation,
      )
      return true
    }

    if (isWearablePairingCommand(text)) {
      appFlowRef.current = { type: 'wearablePairing', step: 'ready' }
      respondWithLocalAssistant(
        displayText,
        '웨어러블 연동을 도와드릴게요. 밴드 화면에 QR 코드가 보이면 준비됐다고 말씀해 주세요.',
        continueConversation,
      )
      return true
    }

    if (isTurnCueCommand(text)) {
      return handleTurnCueCommand(text, displayText, continueConversation)
    }

    if (isEmergencyCommand(text)) {
      return handleEmergencyVoiceCommand(displayText, continueConversation)
    }

    if (isAppFeatureListCommand(text)) {
      respondWithLocalAssistant(displayText, appFeatureListText(), continueConversation)
      return true
    }

    return false
  }

  async function handleEmergencyVoiceCommand(displayText, continueConversation) {
    setIsRequesting(true)
    try {
      const request = await createEmergencyRequest()
      const message = request?.guardianNotified
        ? '긴급 요청을 보냈고 보호자에게도 알렸습니다.'
        : request?.message || '긴급 요청을 보냈습니다.'
      respondWithLocalAssistant(displayText, message, continueConversation)
      return true
    } catch (error) {
      respondWithLocalAssistant(displayText, error.message || '긴급 요청 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.', continueConversation)
      return true
    } finally {
      setIsRequesting(false)
    }
  }

  async function continueAppFlow(flow, text, displayText, continueConversation) {
    if (flow.type === 'deviceAdd') {
      return continueDeviceAddFlow(flow, text, displayText, continueConversation)
    }

    if (flow.type === 'locationGuide') {
      return continueLocationGuideFlow(flow, text, displayText, continueConversation)
    }

    if (flow.type === 'guardianConnect') {
      return continueGuardianConnectFlow(flow, text, displayText, continueConversation)
    }

    if (flow.type === 'wearablePairing') {
      return continueWearablePairingFlow(flow, text, displayText, continueConversation)
    }

    if (flow.type === 'turnCue') {
      appFlowRef.current = null
      setTurnCueEnabled(isAffirmative(text))
      respondWithLocalAssistant(
        displayText,
        isAffirmative(text)
          ? '챗봇 알림음을 켰습니다. 답변이 끝나면 딩 소리로 말할 차례를 알려드릴게요.'
          : '챗봇 알림음을 껐습니다. 다음부터는 음성 안내만 사용할게요.',
        continueConversation,
      )
      return true
    }

    appFlowRef.current = null
    return false
  }

  async function startLocationGuideFlow(text, displayText, continueConversation) {
    const target = findLocationTargetDevice(text, preview?.devices || [], preview?.uwb)
    if (!target) {
      respondWithLocalAssistant(displayText, '어떤 가전의 위치를 안내할까요? 예를 들면 TV 어디 있어, 세탁기 위치 안내해줘처럼 말해 주세요.', continueConversation)
      return true
    }

    appFlowRef.current = {
      type: 'locationGuide',
      step: 'confirmMode',
      target,
      progressIndex: 0,
      useWearable: false,
    }
    respondWithLocalAssistant(displayText, `${target.name} 위치 안내를 시작할게요. 웨어러블 진동과 음성 안내를 함께 사용할까요?`, continueConversation)
    return true
  }

  async function continueLocationGuideFlow(flow, text, displayText, continueConversation) {
    if (isCancelCommand(text) || isLocationStopCommand(text)) {
      appFlowRef.current = null
      respondWithLocalAssistant(displayText, '위치 안내를 종료했습니다.', continueConversation)
      return true
    }

    if (flow.step === 'confirmMode') {
      const nextFlow = {
        ...flow,
        step: 'guiding',
        useWearable: isAffirmative(text),
        progressIndex: 0,
      }
      appFlowRef.current = nextFlow
      respondWithLocalAssistant(displayText, locationGuideMessage(nextFlow), continueConversation)
      return true
    }

    if (flow.step === 'guiding') {
      const nextIndex = Math.min(flow.progressIndex + 1, locationGuideSteps.length - 1)
      const nextFlow = {
        ...flow,
        progressIndex: nextIndex,
      }
      appFlowRef.current = nextFlow
      respondWithLocalAssistant(displayText, locationGuideMessage(nextFlow), continueConversation)
      return true
    }

    return true
  }

  async function startDeviceAddFlow(text, displayText, continueConversation) {
    setIsRequesting(true)
    try {
      const connectedDevices = await loadVoiceDevices(preview?.devices)
      const connectedTypes = new Set(connectedDevices.map((device) => device.type))
      const availableDevices = deviceVoiceCatalog.filter((device) => !connectedTypes.has(device.type))
      const selectedDevice = findVoiceDevice(text)

      if (availableDevices.length === 0) {
        appFlowRef.current = null
        respondWithLocalAssistant(displayText, '현재 추가 가능한 가전이 없습니다. 모든 지원 가전이 이미 연결되어 있어요.', continueConversation)
        return true
      }

      if (!selectedDevice) {
        appFlowRef.current = {
          type: 'deviceAdd',
          step: 'select',
          availableDevices,
          connectedTypes: [...connectedTypes],
        }
        const availableNames = availableDevices.map((device) => device.typeLabel).join(', ')
        const connectedNames = deviceVoiceCatalog
          .filter((device) => connectedTypes.has(device.type))
          .map((device) => `${device.typeLabel}는 이미 연결되어 있습니다`)
          .join('. ')
        respondWithLocalAssistant(
          displayText,
          `추가 가능한 가전을 찾고 있습니다. 현재 추가 가능한 가전은 ${availableNames}입니다. ${connectedNames ? `${connectedNames}. ` : ''}어떤 가전을 추가할까요?`,
          continueConversation,
        )
        return true
      }

      if (connectedTypes.has(selectedDevice.type)) {
        respondWithLocalAssistant(displayText, `${selectedDevice.typeLabel}는 이미 연결되어 있습니다. 다른 가전을 추가할까요?`, continueConversation)
        return true
      }

      appFlowRef.current = {
        type: 'deviceAdd',
        step: 'name',
        device: selectedDevice,
        draft: createDeviceDraft(selectedDevice),
      }
      respondWithLocalAssistant(
        displayText,
        `${selectedDevice.typeLabel}를 추가할게요. 가전 이름은 ${selectedDevice.defaultName}로 저장할까요?`,
        continueConversation,
      )
      return true
    } finally {
      setIsRequesting(false)
    }
  }

  async function continueDeviceAddFlow(flow, text, displayText, continueConversation) {
    if (isCancelCommand(text)) {
      appFlowRef.current = null
      respondWithLocalAssistant(displayText, '가전 추가를 취소했습니다.', continueConversation)
      return true
    }

    if (flow.step === 'select') {
      const selectedDevice = findVoiceDevice(text)
      if (!selectedDevice || !flow.availableDevices.some((device) => device.type === selectedDevice.type)) {
        respondWithLocalAssistant(displayText, '추가할 가전을 다시 말씀해 주세요. 예를 들면 TV, 도어센서, 냉장고처럼 말할 수 있어요.', continueConversation)
        return true
      }

      appFlowRef.current = {
        ...flow,
        step: 'name',
        device: selectedDevice,
        draft: createDeviceDraft(selectedDevice),
      }
      respondWithLocalAssistant(displayText, `${selectedDevice.typeLabel}를 추가할게요. 가전 이름은 ${selectedDevice.defaultName}로 저장할까요?`, continueConversation)
      return true
    }

    if (flow.step === 'name') {
      const nextName = isAffirmative(text) ? flow.device.defaultName : cleanSpokenName(text) || flow.device.defaultName
      const nextFlow = {
        ...flow,
        step: 'location',
        draft: {
          ...flow.draft,
          name: nextName,
        },
      }
      appFlowRef.current = nextFlow
      respondWithLocalAssistant(displayText, `${nextName}라는 이름으로 저장할게요. vendorDeviceId는 ${nextFlow.draft.vendorDeviceId}로 확인되었습니다. 위치 안내 사용을 켤까요?`, continueConversation)
      return true
    }

    if (flow.step === 'location') {
      const nextFlow = {
        ...flow,
        step: flow.device.type === 'DOOR_SENSOR' ? 'doorAlert' : 'remote',
        draft: {
          ...flow.draft,
          locationSupported: isAffirmative(text),
        },
      }
      appFlowRef.current = nextFlow
      respondWithLocalAssistant(
        displayText,
        flow.device.type === 'DOOR_SENSOR' ? '문 열림 알림을 받을까요?' : '원격 제어 사용도 켤까요?',
        continueConversation,
      )
      return true
    }

    if (flow.step === 'doorAlert') {
      return finishDeviceAddFlow({
        ...flow,
        draft: {
          ...flow.draft,
          remoteEnabled: false,
          doorAlertEnabled: isAffirmative(text),
        },
      }, displayText, continueConversation)
    }

    if (flow.step === 'remote') {
      return finishDeviceAddFlow({
        ...flow,
        draft: {
          ...flow.draft,
          remoteEnabled: isAffirmative(text),
        },
      }, displayText, continueConversation)
    }

    return true
  }

  async function finishDeviceAddFlow(flow, displayText, continueConversation) {
    setIsRequesting(true)
    try {
      const savedDevice = await createDevice({
        vendor: 'LG_THINQ',
        vendorDeviceId: flow.draft.vendorDeviceId,
        name: flow.draft.name,
        type: flow.draft.type,
        locationSupported: flow.draft.locationSupported,
        remoteEnabled: flow.draft.remoteEnabled,
      })
      const name = savedDevice?.name || flow.draft.name
      appFlowRef.current = null
      const locationText = flow.draft.locationSupported ? '위치 안내를 켰고' : '위치 안내는 꺼져 있고'
      const remoteText = flow.device.type === 'DOOR_SENSOR'
        ? flow.draft.doorAlertEnabled ? '문 열림 알림을 켰습니다' : '문 열림 알림은 꺼져 있습니다'
        : flow.draft.remoteEnabled ? '원격 제어를 켰습니다' : '원격 제어는 꺼져 있습니다'
      respondWithLocalAssistant(displayText, `${name}를 추가했습니다. ${locationText}, ${remoteText}.`, continueConversation)
      return true
    } catch (error) {
      appFlowRef.current = null
      respondWithLocalAssistant(displayText, error.message || '가전 추가에 실패했습니다. 잠시 후 다시 시도해 주세요.', continueConversation)
      return true
    } finally {
      setIsRequesting(false)
    }
  }

  async function continueGuardianConnectFlow(flow, text, displayText, continueConversation) {
    if (isCancelCommand(text)) {
      appFlowRef.current = null
      respondWithLocalAssistant(displayText, '보호자 연결을 취소했습니다.', continueConversation)
      return true
    }

    if (flow.step === 'email') {
      const email = extractEmail(text)
      if (!email) {
        respondWithLocalAssistant(displayText, '이메일을 잘 듣지 못했어요. 예를 들면 guardian@example.com처럼 다시 말씀해 주세요.', continueConversation)
        return true
      }

      appFlowRef.current = {
        ...flow,
        step: 'primary',
        email,
      }
      respondWithLocalAssistant(displayText, `${email} 보호자를 연결할게요. 대표 보호자로 설정할까요?`, continueConversation)
      return true
    }

    if (flow.step === 'primary') {
      appFlowRef.current = {
        ...flow,
        step: 'notify',
        isPrimary: isAffirmative(text),
      }
      respondWithLocalAssistant(displayText, '위험 알림을 이 보호자에게 보낼까요?', continueConversation)
      return true
    }

    if (flow.step === 'notify') {
      setIsRequesting(true)
      try {
        const guardian = await linkGuardianByEmail({
          email: flow.email,
          isPrimary: flow.isPrimary,
          notifyOnDanger: isAffirmative(text),
        })
        appFlowRef.current = null
        respondWithLocalAssistant(displayText, `${guardian?.name || '보호자'} 연결을 완료했습니다. 위험 알림 설정도 저장했습니다.`, continueConversation)
        return true
      } catch (error) {
        appFlowRef.current = null
        respondWithLocalAssistant(displayText, error.message || '보호자 연결에 실패했습니다. 이메일을 확인하고 다시 시도해 주세요.', continueConversation)
        return true
      } finally {
        setIsRequesting(false)
      }
    }

    return true
  }

  async function continueWearablePairingFlow(flow, text, displayText, continueConversation) {
    if (isCancelCommand(text)) {
      appFlowRef.current = null
      respondWithLocalAssistant(displayText, '웨어러블 연동을 취소했습니다.', continueConversation)
      return true
    }

    if (flow.step === 'ready') {
      appFlowRef.current = {
        ...flow,
        step: 'scan',
      }
      respondWithLocalAssistant(
        displayText,
        '좋아요. 앱의 메뉴에서 웨어러블 연동 화면을 열고, 밴드 QR 코드를 카메라에 맞춰 주세요. QR 인식이 끝나면 연동 완료라고 말해 주세요.',
        continueConversation,
      )
      return true
    }

    if (flow.step === 'scan') {
      appFlowRef.current = null
      respondWithLocalAssistant(displayText, '웨어러블 연동 안내를 마쳤습니다. QR 인식 후 밴드가 연결되면 앱의 기기 화면에서 상태를 확인할 수 있어요.', continueConversation)
      return true
    }

    return true
  }

  function handleTurnCueCommand(text, displayText, continueConversation) {
    if (text.includes('꺼') || text.includes('끄')) {
      setTurnCueEnabled(false)
      respondWithLocalAssistant(displayText, '챗봇 알림음을 껐습니다. 다음부터는 음성 안내만 사용할게요.', continueConversation)
      return true
    }

    if (text.includes('켜') || text.includes('추가') || text.includes('사용')) {
      setTurnCueEnabled(true)
      respondWithLocalAssistant(displayText, '챗봇 알림음을 켰습니다. 답변이 끝나면 딩 소리로 말할 차례를 알려드릴게요.', continueConversation)
      return true
    }

    appFlowRef.current = { type: 'turnCue', step: 'confirm' }
    respondWithLocalAssistant(displayText, '챗봇 알림음을 켤까요?', continueConversation)
    return true
  }

  function respondWithLocalAssistant(userText, assistantText, continueConversation, extraData = {}) {
    const visibleUserText = userText.trim()
    const shouldKeepTalking = continueConversation || conversationActiveRef.current
    const botMessage = createChatMessage('bot', assistantText, {
      data: {
        answerText: assistantText,
        voiceText: assistantText,
        intent: 'APP_VOICE_FLOW',
        action: 'LOCAL_APP_ACTION',
        ...extraData,
      },
    })
    setInputText('')
    setError('')
    spokenBotMessageIdsRef.current.add(botMessage.id)
    setMessages((previousMessages) => [
      ...previousMessages,
      ...(visibleUserText ? [createChatMessage('user', visibleUserText)] : []),
      botMessage,
    ])
    setStatus('응답 중...')
    cueAssistantTurn()
    if (shouldKeepTalking) {
      speakAndCueUserTurn(assistantText, () => {
        setStatus('응답 완료')
      })
    } else {
      setChatbotVoiceState(CHATBOT_VOICE_STATE.SPEAKING)
      speak(assistantText, () => {
        setStatus('응답 완료')
      })
    }
  }

  function speakBotMessageNow(message, keepConversation) {
    if (!message?.id || spokenBotMessageIdsRef.current.has(message.id)) {
      return
    }

    spokenBotMessageIdsRef.current.add(message.id)
    const voiceText = getBotMessageVoiceText(message, chatbotContext)
    setStatus('응답 중...')
    if (keepConversation) {
      speakAndCueUserTurn(voiceText, () => {
        setStatus('응답 완료')
      })
    } else {
      setChatbotVoiceState(CHATBOT_VOICE_STATE.SPEAKING)
      speak(voiceText, () => {
        setStatus('응답 완료')
      })
    }
  }

  async function sendMessage(
    text = inputText,
    continueConversation = conversationActiveRef.current,
    displayText = null,
  ) {
    const trimmedText = text.trim()
    const visibleText = (displayText || trimmedText).trim()
    if (requestInFlightRef.current) {
      return
    }

    if (!trimmedText) {
      setError('먼저 문장을 말하거나 입력해 주세요.')
      if (continueConversation) {
        speakAndCueUserTurn('잘 못 들었어요. 다시 말씀해주세요.')
      }
      return
    }

    if (shouldCloseChatbot(trimmedText)) {
      setInputText(trimmedText)
      setChatbotVoiceState(CHATBOT_VOICE_STATE.CLOSING)
      setStatus('대화 종료 중...')
      pauseRecognitionForAssistantSpeech()
      speak(CLOSE_CHATBOT_GUIDE, () => {
        closeChatbot()
      })
      return
    }

    if (await handleAppVoiceCommand(trimmedText, visibleText, continueConversation)) {
      return
    }

    const isFollowup = Boolean(displayText && visibleText !== trimmedText)
    const pendingMessage = createChatMessage('bot', '', { pending: true })
    const requestStartedAt = new Date(pendingMessage.createdAt).getTime()
    const requestResetVersion = chatResetVersionRef.current
    requestInFlightRef.current = true
    setIsRequesting(true)
    setChatbotVoiceState(CHATBOT_VOICE_STATE.THINKING)
    setStatus('챗봇 응답 요청 중...')
    setError('')
    setInputText('')
    setMessages((previousMessages) => [
      ...previousMessages,
      createChatMessage('user', visibleText, { requestText: trimmedText }),
      pendingMessage,
    ])

    try {
      const lastInfoAgent = lastInfoAgentRef.current || (response?.infoCard
        ? {
            title: response.infoCard.title,
            category: response.classification?.category,
            priority: response.classification?.priority,
            source: response.infoCard.source,
            summary: response.infoCard.summary,
            recommendedAction: response.infoCard.recommendedAction,
            importantFields: infoCardImportantFields(response.infoCard),
          }
        : null)
      const data = await requestVoiceChat({
        sessionId: 'app-demo',
        text: trimmedText,
        language: 'ko-KR',
        user: {
          userId: summary?.user?.userId || session?.account?.id || 1,
          name: summary?.user?.name || session?.account?.name || '',
          accessibilityType: summary?.user?.accessibilityType || 'VISUAL',
          guardianLinked: true,
        },
        context: {
          ...chatbotContext,
          ...(lastInfoAgent ? { lastInfoAgent } : {}),
        },
      })

      await waitForMinimumDuration(requestStartedAt, 350)
      if (requestResetVersion !== chatResetVersionRef.current) {
        return
      }

      const enrichedData = {
        ...data,
        requestText: trimmedText,
      }

      if (enrichedData.infoCard) {
        lastInfoAgentRef.current = {
          title: enrichedData.infoCard.title,
          category: enrichedData.classification?.category,
          priority: enrichedData.classification?.priority,
          source: enrichedData.infoCard.source,
          summary: enrichedData.infoCard.summary,
          recommendedAction: enrichedData.infoCard.recommendedAction,
          importantFields: infoCardImportantFields(enrichedData.infoCard),
        }
        setFollowupPromptResponse(enrichedData)
      }
      const botMessageForSpeech = {
        ...pendingMessage,
        pending: false,
        text: enrichedData.answerText || '응답을 받았습니다.',
        data: enrichedData,
        hideInfoCard: isFollowup,
      }
      setResponse(enrichedData)
      setMessages((previousMessages) => previousMessages.map((message) => (
        message.id === pendingMessage.id
          ? botMessageForSpeech
          : message
      )))
      setStatus('응답 중...')
      cueAssistantTurn()
      speakBotMessageNow(botMessageForSpeech, continueConversation || conversationActiveRef.current)
    } catch (requestError) {
      await waitForMinimumDuration(requestStartedAt, 350)
      if (requestResetVersion !== chatResetVersionRef.current) {
        return
      }

      const errorText = requestError.message || '음성 챗봇 연결에 실패했습니다.'
      const botErrorMessage = {
        ...pendingMessage,
        pending: false,
        error: true,
        text: '연결에 실패했어요. 잠시 후 다시 시도해 주세요.',
      }
      setError(errorText)
      setMessages((previousMessages) => previousMessages.map((message) => (
        message.id === pendingMessage.id
          ? botErrorMessage
          : message
      )))
      setStatus('연결 실패')
      speakBotMessageNow(botErrorMessage, continueConversation || conversationActiveRef.current)
    } finally {
      if (requestResetVersion === chatResetVersionRef.current) {
        requestInFlightRef.current = false
        setIsRequesting(false)
      }
    }
  }

  function sendRecognizedText(text) {
    const trimmedText = text.trim()
    if (!trimmedText || sentTranscriptRef.current === trimmedText) {
      return
    }

    sentTranscriptRef.current = trimmedText
    if (!isMeaningfulVoiceRequest(trimmedText)) {
      handleRecognitionFailure(UNCLEAR_SPEECH_GUIDE)
      return
    }

    sendMessage(trimmedText)
  }

  function handleRecognitionFailure(message) {
    if (!conversationActiveRef.current || manualStopRef.current) {
      return
    }

    recognitionFailureCountRef.current += 1
    const guidanceText = recognitionFailureCountRef.current >= 2
      ? RECOGNITION_REPEAT_FAILURE_GUIDE
      : message
    setError('')
    setInputText('')
    speakAndCueUserTurn(guidanceText, () => {
      setStatus('응답 완료')
    })
  }

  function cueAssistantTurn() {
    return true
  }

  function speakAndCueUserTurn(text, afterSpeech, options = {}) {
    pauseRecognitionForAssistantSpeech()
    setChatbotVoiceState(CHATBOT_VOICE_STATE.SPEAKING)
    speak(text, () => {
      afterSpeech?.()
      cueUserTurnAndListen()
    }, options)
  }

  function speakGreetingAndCueUserTurn() {
    pauseRecognitionForAssistantSpeech()
    setChatbotVoiceState(CHATBOT_VOICE_STATE.SPEAKING)
    const greetingVersion = audioStopVersionRef.current
    playGreetingAudio().then((played) => {
      if (
        greetingVersion !== audioStopVersionRef.current
        || !conversationActiveRef.current
        || manualStopRef.current
      ) {
        return
      }

      if (played) {
        cueUserTurnAndListen()
        return
      }

      speakAndCueUserTurn('무엇을 도와드릴까요')
    })
  }

  function replayAndCueUserTurn(text) {
    if (!text) {
      return
    }

    conversationActiveRef.current = true
    manualStopRef.current = false
    speakAndCueUserTurn(text)
  }

  function pauseRecognitionForAssistantSpeech() {
    recognitionStartingRef.current = false
    recognitionListeningRef.current = false
    window.clearTimeout(recognitionStartTimeoutRef.current)
    try {
      recognitionRef.current?.abort?.()
    } catch {
      // The recognizer may already be stopped between turns.
    }
    setIsListening(false)
  }

  function cueUserTurnAndListen() {
    if (!conversationActiveRef.current || manualStopRef.current) {
      return
    }

    setChatbotVoiceState(CHATBOT_VOICE_STATE.BEEPING)
    setStatus('말씀해 주세요')
    window.clearTimeout(turnCueTimeoutRef.current)
    const cueVersion = audioStopVersionRef.current
    turnCueTimeoutRef.current = window.setTimeout(() => {
      playTurnCue('user', { force: true }).finally(() => {
        if (
          cueVersion === audioStopVersionRef.current
          && conversationActiveRef.current
          && !manualStopRef.current
          && voiceStateRef.current === CHATBOT_VOICE_STATE.BEEPING
        ) {
          setChatbotVoiceState(CHATBOT_VOICE_STATE.LISTENING)
          startListening()
        }
      })
    }, 220)
  }

  async function playTurnCue(kind, options = {}) {
    if (!turnCueEnabled && !options.force) {
      return true
    }

    return playTurnCueTone(kind)
  }

  function speak(text, onEnd, options = {}) {
    if (!text || !('speechSynthesis' in window)) {
      if (options.fallbackAudio) {
        const fallbackVersion = audioStopVersionRef.current
        options.fallbackAudio().finally(() => {
          if (fallbackVersion === audioStopVersionRef.current) {
            onEnd?.()
          }
        })
        return
      }

      onEnd?.()
      return
    }

    window.clearTimeout(speechEndTimeoutRef.current)
    window.clearTimeout(speechStartTimeoutRef.current)
    window.clearTimeout(speechStartDelayTimeoutRef.current)
    window.clearTimeout(speechRetryTimeoutRef.current)
    try {
      window.speechSynthesis.cancel?.()
      window.speechSynthesis.resume?.()
    } catch {
      // Speech synthesis can be unavailable for a moment while mobile browsers swap audio sessions.
    }

    const speechVersion = audioStopVersionRef.current
    speechStartDelayTimeoutRef.current = window.setTimeout(() => {
      if (speechVersion !== audioStopVersionRef.current) {
        return
      }

      window.speechSynthesis.resume?.()
      speakWithRetry(text, onEnd, 0, options, speechVersion)
    }, 120)
  }

  function speakWithRetry(text, onEnd, retryCount, options = {}, speechVersion = audioStopVersionRef.current) {
    const utterance = createKoreanUtterance(text)
    const handleEnd = callOnce(() => {
      window.clearTimeout(speechEndTimeoutRef.current)
      window.clearTimeout(speechStartTimeoutRef.current)
      window.clearTimeout(speechStartDelayTimeoutRef.current)
      window.clearTimeout(speechRetryTimeoutRef.current)
      if (speechVersion !== audioStopVersionRef.current) {
        return
      }

      if (speechVersion === audioStopVersionRef.current) {
        onEnd?.()
      }
    })
    const handleError = callOnce(() => {
      window.clearTimeout(speechEndTimeoutRef.current)
      window.clearTimeout(speechStartTimeoutRef.current)
      window.clearTimeout(speechStartDelayTimeoutRef.current)
      window.clearTimeout(speechRetryTimeoutRef.current)
      if (retryCount < 2) {
        speechRetryTimeoutRef.current = window.setTimeout(() => {
          if (speechVersion !== audioStopVersionRef.current) {
            return
          }

          window.speechSynthesis?.resume?.()
          speakWithRetry(text, onEnd, retryCount + 1, options, speechVersion)
        }, 250)
        return
      }

      if (options.fallbackAudio) {
        options.fallbackAudio().finally(() => {
          if (speechVersion === audioStopVersionRef.current) {
            onEnd?.()
          }
        })
        return
      }

      onEnd?.()
    })

    utterance.onend = handleEnd
    utterance.onerror = handleError
    window.speechSynthesis.speak(utterance)
    window.speechSynthesis.resume?.()
    const fallbackMs = Math.min(Math.max(text.length * 350, 4500), 30000)
    speechEndTimeoutRef.current = window.setTimeout(handleEnd, fallbackMs)
  }

  return (
    <>
      {!embedded ? (
        <button
          className="voice-chatbot-fab"
          type="button"
          aria-label="음성 챗봇 열기"
          onClick={() => runChatbotButtonAction(openChatbot)}
        >
          AI
        </button>
      ) : null}

      {isOpen ? (
        <section className={embedded ? 'voice-chatbot-panel voice-chatbot-embedded' : 'voice-chatbot-panel'} aria-label="음성 챗봇">
          {assistantMode === 'select' ? (
            <>
              <div className="voice-chatbot-header">
                <div className="voice-chatbot-brand">
                  <span className="voice-ai-avatar" aria-hidden="true">AI</span>
                  <div>
                    <h2>챗봇</h2>
                    <p className="card-label">LG Able Band</p>
                  </div>
                </div>
                <button type="button" className="voice-close-button" aria-label="챗봇 닫기" onClick={closeChatbot}>
                  ×
                </button>
              </div>
              <ChatbotFeatureSelect
                onOpenSpeak={() => runChatbotButtonAction(() => setAssistantMode('speak'))}
                onOpenTalk={() => runChatbotButtonAction(openChatbot)}
              />
            </>
          ) : null}

          {assistantMode === 'speak' ? (
            <SpeakForMeScreen onBack={() => runChatbotButtonAction(returnToFeatureSelect)} />
          ) : null}

          {assistantMode === 'talk' ? (
            <>
          <div className="voice-chatbot-header voice-talk-header">
            <button
              type="button"
              className="voice-close-button voice-talk-back"
              aria-label="챗봇 선택으로 돌아가기"
              onClick={() => runChatbotButtonAction(returnToFeatureSelect)}
            >
              ‹
            </button>
            <div className="voice-talk-title">
              <h2>챗봇과 대화하기</h2>
            </div>
            <button
              type="button"
              className="voice-reset-button"
              aria-label="대화 초기화"
              onClick={() => runChatbotButtonAction(() => setShowResetConfirm(true))}
            >
              ↻
            </button>
          </div>

          <div className="voice-chatbot-status-row" role="status" aria-live="polite">
            <span className={`voice-status-dot ${isListening || isRequesting ? 'is-active' : ''}`} />
            <span>{compactStatusLabel(status, isRequesting, isListening, voiceState)}</span>
          </div>
          {error ? <p className="voice-chatbot-error">{error}</p> : null}

          <div
            className="voice-chatbot-answer voice-chatbot-scroll-area"
            aria-label="음성 챗봇 대화 내용"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className="voice-empty-state voice-chatbot-start">
                <div className="voice-chatbot-greeting">
                  <span className="voice-ai-avatar voice-ai-avatar-small" aria-hidden="true">AI</span>
                  <div className="voice-greeting-bubble">
                    <strong>안녕하세요!</strong>
                    <span>무엇을 도와드릴까요?</span>
                  </div>
                </div>
                <p>궁금한 주제를 선택하거나 직접 질문해 보세요.</p>
                {selectedQuestionCategory ? (
                  <div className="voice-category-prompts">
                    <div className="voice-category-prompt-heading">
                      <div>
                        <strong>{selectedQuestionCategory.title}</strong>
                        <span>아래 질문 중 하나를 선택하거나 직접 입력해 보세요.</span>
                      </div>
                      <button
                        type="button"
                        className="text-link-button"
                        onClick={() => runChatbotButtonAction(() => setSelectedQuestionCategoryId(null))}
                      >
                        다른 주제 선택
                      </button>
                    </div>
                    <div
                      className="voice-category-prompt-list"
                      aria-label={`${selectedQuestionCategory.title} 추천 질문`}
                    >
                      {selectedQuestionCategory.prompts.map((prompt) => (
                        <button
                          type="button"
                          key={prompt}
                          disabled={isRequesting}
                          onClick={() => runChatbotButtonAction(() => sendMessage(prompt, true))}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="voice-start-card-list" aria-label="질문 카테고리">
                    {CHATBOT_QUESTION_CATEGORIES.map((category) => (
                      <button
                        className="voice-start-card voice-category-card"
                        type="button"
                        key={category.id}
                        aria-label={`${category.title} 선택`}
                        disabled={isRequesting}
                        onClick={() => runChatbotButtonAction(() => setSelectedQuestionCategoryId(category.id))}
                      >
                        <span className="voice-start-card-icon voice-category-image-wrap" aria-hidden="true">
                          {category.iconSrc ? (
                            <img src={category.iconSrc} alt="" />
                          ) : (
                            category.icon
                          )}
                        </span>
                        <span>
                          <strong>{category.title}</strong>
                          <small>{category.description}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="voice-chatbot-conversation">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`voice-message-row ${
                      message.role === 'user' ? 'voice-message-row-user' : 'voice-message-row-bot'
                    }`}
                  >
                    {message.role === 'bot' ? (
                      <span className="voice-ai-avatar voice-ai-avatar-small" aria-hidden="true">AI</span>
                    ) : null}

                    <div
                      className={`voice-message-bundle ${
                        message.role === 'user' ? 'voice-message-bundle-user' : 'voice-message-bundle-bot'
                      }`}
                    >
                      {message.pending ? (
                        <div className="voice-thinking-bubble" aria-label="AI가 답변을 준비 중입니다">
                          <span />
                          <span />
                          <span />
                        </div>
                      ) : (
                        <div
                          className={`voice-message-bubble ${
                            message.role === 'user' ? 'voice-message-bubble-user' : 'voice-message-bubble-bot'
                          } ${message.error ? 'voice-message-bubble-error' : ''}`}
                        >
                          {message.text}
                        </div>
                      )}

                      {message.role === 'bot' && !message.hideInfoCard && shouldRenderInfoCard(message.data) ? (
                        <InfoAgentCard
                          response={message.data}
                          onStopAudio={() => runChatbotButtonAction()}
                          onReplay={() => runChatbotButtonAction(() => replayAndCueUserTurn(getSpokenAssistantText(
                            message.data,
                            message.data.voiceText || message.data.answerText || message.text,
                            chatbotContext,
                          )))}
                        />
                      ) : null}

                      {message.role === 'bot' && !message.pending && !message.error ? (
                        <>
                          <ChatAlertCards data={message.data} context={chatbotContext} />
                          <MessageReplayAction
                            onReplay={() => runChatbotButtonAction(() => replayAndCueUserTurn(getSpokenAssistantText(
                              message.data,
                              message.data?.voiceText || message.text,
                              chatbotContext,
                            )))}
                          />
                        </>
                      ) : null}

                    </div>
                  </div>
                ))}
              </div>
            )}
            <div ref={conversationEndRef} />
          </div>

          {hasFollowupPrompts ? (
            <div className="voice-followup-block">
              <div className="voice-followup-heading">
                <strong className="voice-followup-label">✦ 정보 후속 질문</strong>
                <button
                  type="button"
                  className="voice-followup-close"
                  aria-label="정보 후속 질문 닫기"
                  onClick={() => runChatbotButtonAction(() => setFollowupPromptResponse(null))}
                >
                  닫기
                </button>
              </div>
              <div className="voice-followup-row" aria-label="정보 후속 질문">
                {getFollowupPrompts(followupPromptResponse).map((prompt) => {
                  const topic = followupPromptResponse.infoCard?.title || ''
                  const requestText = `${topic} ${prompt}`.trim()

                  return (
                    <button
                      type="button"
                      key={prompt}
                      disabled={isRequesting}
                      onClick={() => runChatbotButtonAction(() => sendMessage(requestText, true, prompt))}
                    >
                      {prompt}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="voice-chatbot-composer">
            <label className="voice-chatbot-field voice-chatbot-input-field">
              <span className="sr-only">인식된 문장</span>
              <textarea
                value={inputText}
                rows={1}
                placeholder="메시지를 입력하세요."
                onChange={(event) => setInputText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    runChatbotButtonAction(() => sendMessage(inputText, true))
                  }
                }}
              />
            </label>

            <button
              className={`voice-chatbot-icon-button voice-chatbot-mic ${isListening ? 'is-active' : ''}`}
              type="button"
              aria-label={isListening ? '음성 인식 중지' : '음성 입력 시작'}
              disabled={!supportsSpeechRecognition || isRequesting}
              onClick={() => runChatbotButtonAction(() => {
                conversationActiveRef.current = true
                manualStopRef.current = false
                if (isListening) {
                  stopListening()
                } else {
                  startListening()
                }
              }, { stopRecognition: false })}
            >
              <span aria-hidden="true">🎙</span>
            </button>

            <button
              className="primary-button compact-button voice-chatbot-send"
              type="button"
              aria-label="텍스트로 보내기"
              disabled={isRequesting}
              onClick={() => runChatbotButtonAction(() => sendMessage(inputText, true))}
            >
              {isRequesting ? '…' : '↗'}
            </button>
          </div>

          {showResetConfirm ? (
            <div className="voice-reset-dialog-backdrop">
              <div
                className="voice-reset-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="voice-reset-title"
              >
                <h3 id="voice-reset-title">현재 대화 내용을 초기화할까요?</h3>
                <p>화면의 대화만 비우고, 알림이나 기기 정보는 삭제하지 않습니다.</p>
                <div className="voice-reset-dialog-actions">
                  <button
                    type="button"
                    className="voice-reset-cancel"
                    onClick={() => runChatbotButtonAction(() => setShowResetConfirm(false))}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="voice-reset-confirm"
                    onClick={() => runChatbotButtonAction(resetChat)}
                  >
                    초기화
                  </button>
                </div>
              </div>
            </div>
          ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  )
}

function InfoAgentCard({ response, onReplay, onStopAudio }) {
  const priority = response.classification?.priority
  const category = response.classification?.category
  const showUrgentActions = category === '재난/안전' || priority === 'URGENT'

  return (
    <article className="voice-info-card" aria-label="AI 접근성 정보 카드">
      <div className="voice-info-card-top">
        <p className="card-label">AI 접근성 정보</p>
        <h3>{response.infoCard.title}</h3>
        <div className="voice-info-tags" aria-label="정보 분류와 중요도">
          {response.classification?.category ? (
            <span className="voice-info-tag voice-info-tag-category">{response.classification.category}</span>
          ) : null}
          {priority ? (
            <span className={`voice-info-tag voice-info-tag-priority priority-${priority.toLowerCase()}`}>
              중요도 {priority}
            </span>
          ) : null}
        </div>
      </div>

      {response.infoCard.summary ? (
        <InfoCardSection icon="▤" title="요약">
          {response.infoCard.summary}
        </InfoCardSection>
      ) : null}

      {response.infoCard.recommendedAction ? (
        <InfoCardSection icon="✓" title="해야 할 일" action>
          {response.infoCard.recommendedAction}
        </InfoCardSection>
      ) : null}

      {response.infoCard.source || response.infoCard.url ? (
        <section className="voice-info-section voice-info-section-source">
          <span className="voice-info-section-icon" aria-hidden="true">⌂</span>
          <div>
            <strong>출처</strong>
            {response.infoCard.source ? <p>{response.infoCard.source}</p> : null}
            {response.infoCard.url ? (
              <a
                className="voice-info-link"
                href={response.infoCard.url}
                target="_blank"
                rel="noreferrer"
                aria-label="자세히 보기"
              >
                자세히 보기 ›
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {showUrgentActions && response.notifyGuardian ? (
        <div className="voice-guardian-box">
          <strong>보호자에게 공유할 수 있어요.</strong>
          <span>긴급하거나 도움이 필요한 정보를 보호자에게 전달합니다.</span>
        </div>
      ) : null}

      <div className="voice-info-actions">
        <button type="button" className="compact-button" aria-label="AI 접근성 정보 다시 듣기" onClick={onReplay}>
          다시 듣기
        </button>
        {showUrgentActions && response.notifyGuardian ? (
          <button
            type="button"
            className="primary-button compact-button"
            aria-label="보호자에게 이 정보 공유하기"
            onClick={() => {
              onStopAudio?.()
              // TODO: Connect the guardian sharing API when it is available.
            }}
          >
            보호자에게 공유
          </button>
        ) : null}
      </div>
    </article>
  )
}

function InfoCardSection({ icon, title, action = false, children }) {
  return (
    <section className={`voice-info-section ${action ? 'voice-info-section-action' : ''}`}>
      <span className="voice-info-section-icon" aria-hidden="true">{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </section>
  )
}

function ChatAlertCards({ data, context }) {
  if (!shouldRenderAlertCards(data)) {
    return null
  }

  const alerts = getAlertCardsForResponse(data, context)

  return (
    <section className="voice-chat-alerts" aria-label="챗봇 알림 카드">
      <strong>현재 새로운 알림이 {alerts.length}건 있습니다.</strong>
      <div className="voice-chat-alert-list">
        {alerts.map((alert) => (
          <article className="voice-chat-alert-card" key={alert.id || `${alert.title}-${alert.time}`}>
            <span className="voice-chat-alert-icon" aria-hidden="true">
              {isImportantAlert(alert) ? '!' : 'i'}
            </span>
            <div>
              <h3>{alert.title || '알림'}</h3>
              <p>{alert.message || '상세 내용이 없습니다.'}</p>
              <small>{alert.time || formatChatAlertTime(alert.createdAt)}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function createStructuredResponseData(structuredResult, requestText) {
  const resultData = structuredResult.result?.data || {}
  const hasAlerts = Array.isArray(resultData.alerts)
  return {
    responseType: 'STRUCTURED_VOICE_ACTION',
    requestText,
    intent: hasAlerts ? 'READ_ALERTS' : 'STRUCTURED_VOICE_ACTION',
    action: hasAlerts ? 'READ_ALERTS' : 'EXECUTE_APP_ACTION',
    alerts: resultData.alerts,
    voiceActionResult: structuredResult.result,
  }
}

function getBotMessageVoiceText(message, context) {
  if (!message?.data) {
    return message?.text || ''
  }

  return getSpokenAssistantText(
    message.data,
    message.data.voiceText || message.data.answerText || message.text,
    context,
  )
}

function getSpokenAssistantText(data, fallbackText, context) {
  const parts = []
  addSpokenPart(parts, data?.voiceText || fallbackText || data?.answerText)

  if (shouldRenderInfoCard(data)) {
    addSpokenPart(parts, data.infoCard?.title)
    addSpokenPart(parts, data.infoCard?.summary ? `요약. ${data.infoCard.summary}` : '')
    addSpokenPart(parts, data.infoCard?.recommendedAction ? `해야 할 일. ${data.infoCard.recommendedAction}` : '')
    addSpokenPart(parts, data.infoCard?.source ? `출처. ${data.infoCard.source}` : '')

    if (data.notifyGuardian) {
      addSpokenPart(parts, '필요하면 이 정보를 보호자에게 공유할 수 있어요.')
    }
  }

  if (shouldRenderAlertCards(data)) {
    const alerts = getAlertCardsForResponse(data, context).slice(0, 3)
    if (alerts.length > 0) {
      addSpokenPart(parts, `현재 새로운 알림이 ${alerts.length}건 있습니다.`)
      alerts.forEach((alert, index) => {
        addSpokenPart(
          parts,
          `${index + 1}번째 알림. ${alert.title || '알림'}. ${alert.message || '상세 내용이 없습니다.'}${alert.time ? ` ${alert.time}.` : ''}`,
        )
      })
    }
  }

  return parts.join(' ')
}

function addSpokenPart(parts, value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) {
    return
  }

  if (parts.some((part) => part === text || part.includes(text) || text.includes(part))) {
    return
  }

  parts.push(text)
}

function MessageReplayAction({ onReplay }) {
  return (
    <div className="voice-message-actions" aria-label="AI 답변 작업">
      <button type="button" aria-label="AI 응답 다시 듣기" onClick={onReplay}>
        다시 듣기
      </button>
    </div>
  )
}

function createChatMessage(role, text, extra = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
    ...extra,
  }
}

function createKoreanUtterance(text) {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.rate = 0.95
  utterance.pitch = 1
  utterance.volume = 1

  const voices = window.speechSynthesis?.getVoices?.() || []
  const koreanVoice = voices.find((voice) => voice.lang?.toLowerCase() === 'ko-kr') ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith('ko')) ||
    voices.find((voice) => /korean|한국|ko-kr/i.test(`${voice.name} ${voice.lang}`))

  if (koreanVoice) {
    utterance.voice = koreanVoice
  }

  return utterance
}

function isDeviceAddCommand(text) {
  const normalized = normalizeSpeechText(text)
  return (
    (normalized.includes('가전') || normalized.includes('기기') || findVoiceDevice(text)) &&
    ['추가', '연결', '등록'].some((keyword) => normalized.includes(keyword))
  )
}

function isGuardianConnectCommand(text) {
  const normalized = normalizeSpeechText(text)
  return normalized.includes('보호자') && ['연결', '등록', '추가'].some((keyword) => normalized.includes(keyword))
}

function isLocationGuideCommand(text) {
  const normalized = normalizeSpeechText(text)
  if (isLocationStopCommand(text)) {
    return false
  }
  const asksLocation = ['위치', '어디', '찾아', '거리'].some((keyword) => normalized.includes(keyword))
  const mentionsDevice = Boolean(findVoiceDevice(text)) ||
    ['가전', '기기', 'tv', '티비', '세탁기', '냉장고', '도어센서', '전기레인지'].some((keyword) => normalized.includes(normalizeSpeechText(keyword)))
  return asksLocation && mentionsDevice
}

function isLocationStopCommand(text) {
  const normalized = normalizeSpeechText(text)
  return normalized.includes('위치안내') && ['멈춰', '중지', '종료', '그만', '꺼'].some((keyword) => normalized.includes(keyword))
}

function isWearablePairingCommand(text) {
  const normalized = normalizeSpeechText(text)
  return ['웨어러블', '밴드', '에이블밴드'].some((keyword) => normalized.includes(keyword)) &&
    ['연동', '페어링', '연결'].some((keyword) => normalized.includes(keyword))
}

function isTurnCueCommand(text) {
  const normalized = normalizeSpeechText(text)
  return ['알림음', '딩소리', '효과음', '소리'].some((keyword) => normalized.includes(keyword)) &&
    ['추가', '설정', '켜', '꺼', '사용'].some((keyword) => normalized.includes(keyword))
}

function isEmergencyCommand(text) {
  const normalized = normalizeSpeechText(text)
  return ['sos', '긴급', '응급', '도움요청', '살려줘'].some((keyword) => normalized.includes(keyword)) &&
    ['요청', '보내', '알려', '호출', '해줘', '연락'].some((keyword) => normalized.includes(keyword))
}

function isAppFeatureListCommand(text) {
  const normalized = normalizeSpeechText(text)
  return normalized.includes('챗봇') && normalized.includes('뭐') && normalized.includes('할수')
}

function isCancelCommand(text) {
  const normalized = normalizeSpeechText(text)
  return ['취소', '그만', '안할래', '중지'].some((keyword) => normalized.includes(keyword))
}

function isAffirmative(text) {
  const normalized = normalizeSpeechText(text)
  if (['아니', '안돼', '꺼줘', '끄기', '싫어', '하지마'].some((keyword) => normalized.includes(keyword))) {
    return false
  }
  return ['응', '네', '그래', '좋아', '맞아', '켜줘', '해줘', '예', 'yes', 'ㅇ'].some((keyword) => normalized.includes(keyword))
}

function findVoiceDevice(text) {
  const normalized = normalizeSpeechText(text)
  return deviceVoiceCatalog.find((device) => (
    device.aliases.some((alias) => normalized.includes(normalizeSpeechText(alias))) ||
    normalized.includes(normalizeSpeechText(device.typeLabel))
  )) || null
}

function findLocationTargetDevice(text, devices, uwb) {
  const requestedDevice = findVoiceDevice(text)
  if (requestedDevice) {
    const connectedDevice = devices.find((device) => device.type === requestedDevice.type)
    return {
      name: connectedDevice?.name || requestedDevice.defaultName,
      type: requestedDevice.type,
      room: connectedDevice?.room || requestedDevice.room || '',
      uwbDistanceM: sameText(uwb?.targetName, connectedDevice?.name || requestedDevice.defaultName)
        ? uwb?.distanceM
        : null,
      uwbDirection: sameText(uwb?.targetName, connectedDevice?.name || requestedDevice.defaultName)
        ? uwb?.direction
        : '',
    }
  }

  if (uwb?.targetName) {
    return {
      name: uwb.targetName,
      type: uwb.targetDeviceType || '',
      room: uwb.room || '',
      uwbDistanceM: uwb.distanceM,
      uwbDirection: uwb.direction || '',
    }
  }

  const locationDevice = devices.find((device) => device.locationSupported) || devices[0]
  return locationDevice
    ? {
        name: locationDevice.name,
        type: locationDevice.type,
        room: locationDevice.room || '',
        uwbDistanceM: null,
        uwbDirection: '',
      }
    : null
}

function locationGuideMessage(flow) {
  const step = locationGuideSteps[flow.progressIndex] || locationGuideSteps.at(-1)
  const wearableText = flow.useWearable ? '웨어러블 진동과 음성 안내를 함께 사용할게요. ' : ''

  if (flow.progressIndex === 0) {
    const distanceText = formatGuideDistance(flow.target.uwbDistanceM) || step.distanceText
    const directionText = flow.target.uwbDirection || step.directionText
    return `${wearableText}${flow.target.name}까지의 거리를 확인하고 있습니다. 현재 ${distanceText}${directionText ? ` ${directionText}에 있습니다` : '입니다'}. ${step.guideText}`
  }

  if (flow.progressIndex === 1) {
    return `${flow.target.name}와 가까워지고 있습니다. 현재 ${step.distanceText}입니다. ${step.guideText}`
  }

  return `${flow.target.name}가 매우 가깝습니다. ${step.distanceText} ${step.directionText}에 있습니다. ${step.guideText}`
}

function formatGuideDistance(distanceM) {
  const distance = Number(distanceM)
  if (!Number.isFinite(distance)) {
    return ''
  }
  if (distance < 1) {
    return `약 ${Math.round(distance * 100)}센티미터`
  }
  return Number.isInteger(distance) ? `약 ${distance}미터` : `약 ${distance.toFixed(1)}미터`
}

function createDeviceDraft(device) {
  return {
    vendorDeviceId: device.defaultVendorDeviceId,
    name: device.defaultName,
    type: device.type,
    locationSupported: device.locationSupported,
    remoteEnabled: device.remoteEnabled,
  }
}

function cleanSpokenName(text) {
  return text
    .replace(/(으로|로)?\s*(해줘|해주세요|저장해줘|저장|할게|해|응|네|예)/g, '')
    .replace(/[.?!]/g, '')
    .trim()
}

function extractEmail(text) {
  const normalized = text
    .replace(/\s+/g, '')
    .replace(/골뱅이|앳|엣/g, '@')
    .replace(/닷|점/g, '.')
    .replace(/지메일/g, 'gmail')
    .replace(/네이버/g, 'naver')
  return normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
}

async function loadVoiceDevices(fallbackDevices = []) {
  try {
    return await getDevices()
  } catch {
    return fallbackDevices
  }
}

function appFeatureListText() {
  return [
    '챗봇으로 할 수 있는 기능은 다음과 같습니다.',
    '가전 추가와 연결, 보호자 이메일 연결, 웨어러블 연동 안내, 챗봇 알림음 켜고 끄기, 긴급 요청 보내기, 알림 확인, 위험 알림 확인, 최근 알림 다시 듣기, 세탁기 남은 시간 확인, 냉장고 문 상태 확인, 공기질 확인, 전기레인지 상태 확인, 도어센서 상태 확인, UWB 가전 위치 확인, 복지와 접근성 정보 검색을 할 수 있어요.',
  ].join(' ')
}

function callOnce(callback) {
  let called = false

  return (...args) => {
    if (called) {
      return
    }

    called = true
    callback(...args)
  }
}

function shouldRenderAlertCards(data) {
  const requestText = data?.requestText || ''
  const alertIntent = ['ALERT_LIST', 'UNREAD_ALERTS_CHECK', 'DANGER_ALERTS_CHECK', 'READ_RECENT_ALERT', 'REPEAT_LAST_ALERT']
  const alertAction = ['READ_ALERTS', 'READ_ALERT_SUMMARY', 'READ_RECENT_ALERT', 'REPEAT_LAST_ALERT']

  return (
    alertIntent.includes(data?.intent) ||
    alertAction.includes(data?.action) ||
    isAlertQuestion(requestText)
  )
}

function isAlertQuestion(text) {
  return [
    '현재 알림',
    '위험 알림',
    '최근 알림',
    '읽지 않은 알림',
    '미확인 알림',
    '안전 알림',
  ].some((keyword) => text.includes(keyword))
}

function getAlertCardsForResponse(data, context) {
  if (Array.isArray(data?.alerts) && data.alerts.length > 0) {
    return data.alerts.map(mapAlertCard)
  }

  if (Array.isArray(data?.notificationCards) && data.notificationCards.length > 0) {
    return data.notificationCards.map(mapAlertCard)
  }

  const requestText = data?.requestText || ''
  const sourceAlerts = requestText.includes('위험')
    ? context.dangerAlerts
    : requestText.includes('읽지 않은') || requestText.includes('미확인')
      ? context.unreadAlerts
      : [context.recentAlert, ...context.unreadAlerts, ...context.dangerAlerts].filter(Boolean)

  const uniqueAlerts = dedupeAlerts(sourceAlerts).slice(0, 3)

  if (uniqueAlerts.length > 0) {
    return uniqueAlerts.map(mapAlertCard)
  }

  return FALLBACK_CHAT_ALERTS
}

function dedupeAlerts(alerts) {
  const seen = new Set()
  return alerts.filter((alert) => {
    const key = alert.id || `${alert.title}-${alert.message}-${alert.createdAt}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mapAlertCard(alert) {
  return {
    id: alert.id || alert.alertId,
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    createdAt: alert.createdAt || alert.occurredAt,
    time: alert.time || formatChatAlertTime(alert.createdAt || alert.occurredAt),
  }
}

function isImportantAlert(alert) {
  return ['HIGH', 'CRITICAL', 'DANGER', 'EMERGENCY'].includes(alert.severity || alert.type)
}

function formatChatAlertTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const now = new Date()
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    const hour = date.getHours()
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${minute}`
  }

  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function compactStatusLabel(status, isRequesting, isListening, voiceState) {
  if (voiceState === CHATBOT_VOICE_STATE.SPEAKING) return '답변 중'
  if (voiceState === CHATBOT_VOICE_STATE.BEEPING) return '대기 중'
  if (voiceState === CHATBOT_VOICE_STATE.LISTENING) return '듣는 중'
  if (voiceState === CHATBOT_VOICE_STATE.THINKING) return '생각 중'
  if (voiceState === CHATBOT_VOICE_STATE.CLOSING) return '종료 중'
  if (voiceState === CHATBOT_VOICE_STATE.OPENING) return '답변 중'
  if (voiceState === CHATBOT_VOICE_STATE.ERROR) return '오류'
  if (isListening) return '듣는 중'
  if (isRequesting) return '답변 정리 중'
  if (status.includes('응답 중')) return '말하는 중'
  if (status.includes('완료')) return '응답 완료'
  if (status.includes('실패')) return '연결 실패'
  if (status.includes('정지')) return '일시 정지'
  if (status.includes('연결 중')) return '마이크 준비 중'
  if (status.includes('대기')) return '대기 중'
  return '대기 중'
}

function shouldRenderInfoCard(data) {
  if (!data?.infoCard) return false
  if (data.responseType === 'FOLLOWUP_ANSWER') return false
  if (data.intent === 'INFO_AGENT_FOLLOWUP') return false
  return true
}

function isMeaningfulVoiceRequest(text) {
  const normalized = normalizeSpeechText(text)
  if (shouldCloseChatbot(normalized) || shouldOpenChatbot(normalized)) {
    return true
  }

  const compact = normalized.replace(/\s+/g, '')
  if (compact.length < 3) {
    return false
  }

  const unclearPatterns = [
    /^아?그럴$/,
    /^아그렇$/,
    /^아$/,
    /^어$/,
    /^음$/,
    /^응$/,
    /^네$/,
    /^그래$/,
    /^그냥$/,
    /^몰라$/,
  ]

  return !unclearPatterns.some((pattern) => pattern.test(compact))
}

async function waitForMinimumDuration(startedAt, minimumDuration) {
  const remaining = minimumDuration - (Date.now() - startedAt)
  if (remaining > 0) {
    await new Promise((resolve) => window.setTimeout(resolve, remaining))
  }
}

function getFollowupPrompts(response) {
  const category = response?.classification?.category || ''
  const priority = response?.classification?.priority || ''

  if (priority === 'URGENT' || category === '재난/안전') {
    return ['지금 어떻게 해야 해?', '보호자에게 알려줘', '안전 행동 다시 알려줘']
  }

  if (category === '의료/건강') {
    return ['지원 대상은 누구야?', '신청 방법 알려줘', '담당 기관 문의 방법은?']
  }

  if (category === '보조기기') {
    return ['지원 대상은 누구야?', '신청 방법 알려줘', '어떤 기기를 지원해?']
  }

  if (category === '취업/교육') {
    return ['신청 조건 알려줘', '교육 내용 알려줘', '담당 기관 문의 방법은?']
  }

  return ['지원 대상은 누구야?', '신청 방법 알려줘', '자세히 알려줘']
}

function speechRecognitionErrorMessage(error) {
  const messages = {
    'not-allowed': '마이크 권한이 차단되었습니다. 주소창의 마이크 권한을 허용해 주세요.',
    'service-not-allowed': '브라우저에서 음성 인식 서비스 사용이 차단되었습니다.',
    'audio-capture': '사용 가능한 마이크를 찾지 못했습니다. 마이크 연결 상태를 확인해 주세요.',
    'no-speech': '음성이 들리지 않았습니다. 마이크 가까이에서 다시 말씀해 주세요.',
    network: '음성 인식 네트워크 연결에 실패했습니다.',
  }
  return messages[error] || `음성 인식 오류: ${error}`
}

function createChatbotContext(summary, preview) {
  const alerts = summary?.recentAlerts || []
  const unreadAlerts = alerts.filter((alert) => alert.status === 'UNREAD').map(mapAlert)
  const dangerAlerts = alerts
    .filter((alert) => ['HIGH', 'CRITICAL'].includes(alert.severity) || alert.type === 'DANGER')
    .map(mapAlert)
  const recentAlert = alerts[0] ? mapAlert(alerts[0]) : null
  const devices = preview?.devices || []

  return {
    unreadAlerts,
    dangerAlerts,
    recentAlert,
    lastSpokenAlert: recentAlert,
    devices: createDeviceContext(devices),
    uwb: createUwbContext(preview?.uwb, devices),
  }
}

function createUwbContext(uwb, devices) {
  if (!uwb) {
    return null
  }

  const targetDevice = devices.find((device) => (
    sameText(device.name, uwb.targetName) ||
    sameText(device.typeLabel, uwb.targetName) ||
    sameText(device.type, uwb.targetDeviceType)
  ))

  return {
    targetName: uwb.targetName || targetDevice?.name || '',
    targetDeviceType: uwb.targetDeviceType || targetDevice?.type || '',
    room: uwb.room || targetDevice?.room || targetDevice?.locationName || '',
    distanceM: uwb.distanceM,
    direction: uwb.direction || '',
    vibrationPattern: uwb.vibrationPattern || '',
    voiceGuide: uwb.voiceGuide || '',
  }
}

function createDeviceContext(devices) {
  const washer = findDevice(devices, 'WASHER')
  const refrigerator = findDevice(devices, 'REFRIGERATOR')
  const airSensor = findDevice(devices, 'AIR_SENSOR')
  const tv = findDevice(devices, 'TV')
  const range = findDevice(devices, 'RANGE')
  const doorSensor = findDevice(devices, 'DOOR_SENSOR')
  const wearable = findDevice(devices, 'WEARABLE')

  return {
    washer: washer
      ? {
          status: readDeviceValue(washer, 'statusCode') || normalizeDeviceStatus(washer),
          remainingMinutes: readDeviceValue(washer, 'remainingMinutes'),
          error: isWarningDevice(washer),
        }
      : null,
    refrigerator: refrigerator
      ? {
          doorOpen: readDeviceValue(refrigerator, 'doorOpen'),
          temperatureStatus: readDeviceValue(refrigerator, 'temperatureStatus') || normalizeDeviceStatus(refrigerator),
          error: isWarningDevice(refrigerator),
        }
      : null,
    airSensor: airSensor
      ? {
          airQuality: readDeviceValue(airSensor, 'airQuality') || normalizeDeviceStatus(airSensor),
          pmLevel: readDeviceValue(airSensor, 'pmLevel'),
          ventilationNeeded: readDeviceValue(airSensor, 'ventilationNeeded'),
          co2Status: readDeviceValue(airSensor, 'co2Status'),
        }
      : null,
    tv: tv
      ? {
          hasPopup: readDeviceValue(tv, 'hasPopup') || false,
          popupMessage: readDeviceValue(tv, 'popupMessage'),
        }
      : null,
    range: range
      ? {
          powerOn: readDeviceValue(range, 'powerOn'),
          longOn: readDeviceValue(range, 'longOn') || isWarningDevice(range),
        }
      : null,
    doorSensor: doorSensor
      ? {
          doorOpen: readDeviceValue(doorSensor, 'doorOpen'),
          securityEvent: readDeviceValue(doorSensor, 'securityEvent') || isWarningDevice(doorSensor),
        }
      : null,
    wearable: wearable
      ? {
          name: wearable.name,
          connectionStatus: normalizeDeviceStatus(wearable),
          batteryLevel: readDeviceValue(wearable, 'batteryLevel'),
        }
      : null,
  }
}

function findDevice(devices, type) {
  return devices.find((device) => device.type === type)
}

function sameText(first, second) {
  if (!first || !second) {
    return false
  }

  return String(first).trim().toLowerCase() === String(second).trim().toLowerCase()
}

function readDeviceValue(device, key) {
  return device?.runtime?.[key] ?? device?.state?.[key] ?? device?.[key]
}

function isWarningDevice(device) {
  return ['WARNING', 'ERROR'].includes(device?.connectionStatus)
}

function normalizeDeviceStatus(device) {
  if (device?.connectionStatus === 'CONNECTED') {
    return 'NORMAL'
  }

  if (device?.connectionStatus === 'WARNING') {
    return 'WARNING'
  }

  if (device?.connectionStatus === 'ERROR') {
    return 'ERROR'
  }

  return device?.status || null
}

function mapAlert(alert) {
  return {
    id: alert.alertId,
    deviceType: alert.deviceType || alert.type,
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    createdAt: alert.occurredAt,
  }
}

function infoCardImportantFields(infoCard) {
  return {
    supportTarget: infoCard?.supportTarget || '',
    eligibility: infoCard?.eligibility || '',
    applicationTarget: infoCard?.applicationTarget || '',
    selectionCriteria: infoCard?.selectionCriteria || '',
    ageCondition: infoCard?.ageCondition || '',
    incomeCondition: infoCard?.incomeCondition || '',
    regionCondition: infoCard?.regionCondition || '',
    supportContent: infoCard?.supportContent || '',
    applyMethod: infoCard?.applyMethod || '',
    applicationMethod: infoCard?.applicationMethod || '',
    applicationPeriod: infoCard?.applicationPeriod || '',
    contact: infoCard?.contact || '',
    requiredDocuments: infoCard?.requiredDocuments || '',
  }
}
