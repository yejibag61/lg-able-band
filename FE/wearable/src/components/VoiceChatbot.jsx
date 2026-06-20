import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getCurrentAlerts,
  getUnreadWearableAlerts,
  getWearableUwbSession,
  getUwbTargets,
  getWearableAppliances,
  markWearableAlertsRead,
  requestWearableEmergencyHelp,
  startWearableUwbSession,
  stopWearableUwbSession,
} from '../services/wearableService'
import { triggerVibration, vibrationPatternForAlert } from '../services/vibrationService'
import { requestVoiceChat } from '../services/voiceChatbotService'
import { handleStructuredVoiceCommand } from '../../../app/src/services/voiceIntentEngine'

const CHATBOT_INTRO =
  'AI 챗봇 실행 완료. 현재 알림 가전 상태 위치 안내 보호자 연결을 도와드려요. 삐 소리 뒤에 기능을 말해주세요.'
const TURN_CUE_AUDIO_SRC = '/chatbot-turn-cue.mp3'
const TURN_BEEP_DURATION_MS = 180
const TURN_BEEP_FREQUENCY_HZ = 880
const TURN_CUE_MAX_MS = 420
const POST_CUE_LISTEN_DELAY_MS = 180
const USER_SILENCE_MS = 2200
const WAITING_USER_TIMEOUT_MS = 9000
const RECOGNITION_STUCK_RESTART_MS = 3500
const MIN_USER_TRANSCRIPT_CHARS = 2
const UWB_POLL_INTERVAL_MS = 2500
const WAKE_RESTART_DELAY_MS = 100
const WAKE_BLOCKED_RESTART_DELAY_MS = 1500
const WAKE_STUCK_RESTART_MS = 7000
const USER_RESTART_DELAY_MS = 450
const CONVERSATION_STATE = {
  IDLE: 'IDLE',
  WAKE_DETECTED: 'WAKE_DETECTED',
  USER_SPEAKING: 'USER_SPEAKING',
  USER_SPEECH_ENDED: 'USER_SPEECH_ENDED',
  AI_SPEAKING: 'AI_SPEAKING',
  AI_SPEECH_ENDED: 'AI_SPEECH_ENDED',
  WAITING_USER: 'WAITING_USER',
  PROCESSING: 'PROCESSING',
}
const VOICE_INTENT = {
  OPEN_CHATBOT: 'OPEN_CHATBOT',
  READ_ALERTS: 'READ_ALERTS',
  READ_APPLIANCE_STATUS: 'READ_APPLIANCE_STATUS',
  FIND_WASHER: 'FIND_WASHER',
  FIND_FRIDGE: 'FIND_FRIDGE',
  GUARDIAN_CONNECT: 'GUARDIAN_CONNECT',
  EMERGENCY_REQUEST: 'EMERGENCY_REQUEST',
  SUBSTITUTE_SPEECH: 'SUBSTITUTE_SPEECH',
  WELFARE_INFO: 'WELFARE_INFO',
  WELFARE_ASSISTIVE_DEVICE: 'WELFARE_ASSISTIVE_DEVICE',
  SHARE_TO_GUARDIAN: 'SHARE_TO_GUARDIAN',
  REPEAT: 'REPEAT',
  CONFIRM_DONE: 'CONFIRM_DONE',
  YES: 'YES',
  NO: 'NO',
  STOP_UWB: 'STOP_UWB',
  CANCEL: 'CANCEL',
  GO_START: 'GO_START',
  GO_IDLE: 'GO_IDLE',
  UNKNOWN: 'UNKNOWN',
}
const WAKE_WORDS = [
  '챗봇켜줘',
  '챗봇켜죠',
  '챗봇켜주',
  '챗봇켜',
  '챗봇켜기',
  '챗봇열어줘',
  '챗봇열어',
  '챗봇시작',
  '챗봇시작해',
  '챗봇실행',
  '챗봇불러',
  '챗봇불러줘',
  '챗봇커줘',
  '챗봇켜저',
  '챗봇켜져',
  '챗봇꺼줘',
  '챗봇크줘',
  '챗봇크자',
  '챗봇켜주세요',
  '챗봇켜주라',
  '챗봇켜줄래',
  '챗봇열어주세요',
  '챗봇시작해줘',
  '챗봇호출',
  '챗지피티켜줘',
  '챗지피티열어줘',
  '지피티켜줘',
  '지피티열어줘',
  '챕봇켜줘',
  '챕봇켜죠',
  '챕봇켜주',
  '찻봇켜줘',
  '찻봇켜죠',
  '찻봇켜주',
  '채봇켜줘',
  '채봇켜죠',
  '채봇켜주',
  '채팅켜줘',
  '채팅켜주세요',
  '채팅시작',
  '채팅열어줘',
  '채팅봇켜줘',
  '채팅봇켜',
  '쳇봇켜줘',
  '쳇봇켜죠',
  '쳇봇켜주',
  '첵봇켜줘',
  '첵봇켜죠',
  '첵봇켜주',
  '체크봇켜줘',
  '책봇켜줘',
  '챗복켜줘',
  '챗보켜줘',
  '챗본켜줘',
  '챗봄켜줘',
  '챗벗켜줘',
  '채포켜줘',
  '챗포켜줘',
  '쳇포켜줘',
  '채보켜줘',
  '첵봇열어줘',
  '체크봇열어줘',
  '책봇열어줘',
  '첵봇시작',
  '체크봇시작',
  '책봇시작',
  '에이아이켜줘',
  '에이아이열어줘',
  '에이아이시작',
  '에이아이켜주세요',
  '에이아이모드시작',
  '에이아이모드켜줘',
  'ai켜줘',
  'ai열어줘',
  'ai시작',
  'ai켜주세요',
  'ai모드시작',
  'ai챗봇',
  'ai챗켜줘',
  'ai모드켜줘',
  'able챗봇',
  '에이블챗봇',
  '에이블챗켜줘',
  '에이블봇켜줘',
  '에이블',
  '에이블켜줘',
  '도와줘',
  '도와주세요',
]
const CLOSE_WORDS = ['종료', '닫아', '챗봇꺼줘', '끝내', '대기모드로돌아가', '대기상태로돌아가']
let speechKeepAliveTimer = null
let speechFallbackTimer = null
let speechHardFallbackTimer = null
let chatbotSpeakingChangeHandler = null
let speechQueue = Promise.resolve()

const quickPhrases = [
  { id: 'help', icon: '🫶', text: '도와주세요' },
  { id: 'water', icon: '💧', text: '물을 주세요' },
  { id: 'pain', icon: '😣', text: '아파요' },
  { id: 'ok', icon: '🙂', text: '괜찮아요' },
]

const morePhrases = [
  { id: 'bathroom', icon: '🚽', text: '화장실에 가고 싶어요' },
  { id: 'guardian', icon: '📞', text: '보호자를 불러주세요' },
  { id: 'slowly', icon: '💬', text: '천천히 말해주세요' },
  { id: 'repeat', icon: '🔊', text: '다시 말해주세요' },
]

const wearableAiCategories = [
  { id: 'welfare', icon: '❤️', label: '복지 정보' },
  { id: 'safety', icon: '🛡️', label: '생활/안전' },
  { id: 'devices', icon: '🏠', label: '가전 상태' },
  { id: 'guardian', icon: '📞', label: '보호자 연결' },
]

const wearableAiQuestions = {
  welfare: [
    { id: 'medical', icon: '🏥', label: '의료비 지원', query: '장애인 의료비 지원 알려줘' },
    { id: 'transport', icon: '🚌', label: '교통비 지원', query: '장애인 교통비 지원 신청 방법 알려줘' },
    { id: 'assistiveDevice', icon: '🦾', label: '보조기기 지원', query: '보조기기 지원 받을 수 있어?' },
    { id: 'activitySupport', icon: '🤝', label: '활동지원 서비스', query: '장애인 활동지원 서비스 알려줘' },
    { id: 'direct', icon: '✍️', label: '직접 질문하기', direct: true },
  ],
  safety: [
    { id: 'recentAlerts', icon: '🔔', label: '최근 알림 확인', query: '최근 알림 알려줘' },
    { id: 'riskAlerts', icon: '⚠️', label: '위험 알림 확인', query: '위험 알림 확인해줘' },
    { id: 'unreadAlerts', icon: '📬', label: '읽지 않은 알림 확인', query: '읽지 않은 알림 알려줘' },
    { id: 'direct', icon: '✍️', label: '직접 질문하기', direct: true },
  ],
  devices: [
    { id: 'washer', icon: '🫧', label: '세탁기 상태 알려줘', query: '세탁기 상태 알려줘' },
    { id: 'fridgeDoor', icon: '❄️', label: '냉장고 문 열려 있어?', query: '냉장고 문 열려 있어?' },
    { id: 'airQuality', icon: '💨', label: '공기질 상태 확인해줘', query: '공기질 상태 확인해줘' },
    { id: 'deviceLocation', icon: '📍', label: '가전 위치 안내해줘', query: '가전 위치 안내해줘' },
    { id: 'stoveStatus', icon: '🔥', label: '전기레인지 상태 확인해줘', query: '전기레인지 상태 확인해줘' },
    { id: 'doorSensor', icon: '🚪', label: '도어센서 상태 확인해줘', query: '도어센서 상태 확인해줘' },
    { id: 'connectedDevices', icon: '🔗', label: '연결된 기기 상태 알려줘', query: '연결된 기기 상태 알려줘' },
    { id: 'direct', icon: '✍️', label: '직접 질문하기', direct: true },
  ],
  guardian: [
    { id: 'connect', icon: '📞', label: '보호자에게 연결 요청', query: '보호자에게 연결 요청해줘' },
    { id: 'emergency', icon: '🚨', label: '긴급 도움 요청', query: '긴급 도움 요청해줘' },
    { id: 'guardianAlerts', icon: '👥', label: '최근 보호자 알림 확인', query: '최근 보호자 알림 확인해줘' },
    { id: 'direct', icon: '✍️', label: '직접 질문하기', direct: true },
  ],
}

const wearableAiFollowups = [
  { id: 'apply', label: '신청 방법', query: '신청 방법 알려줘' },
  { id: 'target', label: '지원 대상', query: '지원 대상 알려줘' },
  { id: 'contact', label: '문의처', query: '문의처 알려줘' },
  { id: 'other', label: '다른 질문 보기', query: '' },
]

const welfareCategories = [
  { id: 'medical', icon: '🏥', label: '의료비 지원' },
  { id: 'assistiveDevice', icon: '🦾', label: '보조기기 지원' },
  { id: 'transport', icon: '🚕', label: '교통 지원' },
  { id: 'activity', icon: '🧑‍🦯', label: '활동 지원' },
]

const moreWelfareCategories = [
  { id: 'housing', icon: '🏠', label: '주거 지원' },
  { id: 'job', icon: '💼', label: '일자리 지원' },
  { id: 'education', icon: '📚', label: '교육 지원' },
  { id: 'safety', icon: '🚨', label: '재난/안전 정보' },
]

const welfareAnswers = {
  medical: {
    title: '의료비 지원',
    icon: '🏥',
    lines: ['장애인 의료비 부담을', '줄여주는 지원이에요.', '대상과 신청 방법은 앱에서 확인하세요.'],
  },
  assistiveDevice: {
    title: '보조기기 지원',
    icon: '🦾',
    lines: ['보조기기 구입이나 대여를', '도와주는 지원이에요.', '자세한 품목은 앱에서 확인하세요.'],
  },
  transport: {
    title: '교통 지원',
    icon: '🚕',
    lines: ['장애인 이동과 교통비를', '돕는 지원이에요.', '지역별 내용은 앱에서 확인하세요.'],
  },
  activity: {
    title: '활동 지원',
    icon: '🧑‍🦯',
    lines: ['일상생활과 이동을 돕는', '활동지원 서비스예요.', '신청 조건은 앱에서 확인하세요.'],
  },
  housing: {
    title: '주거 지원',
    icon: '🏠',
    lines: ['주거 환경 개선이나 임대료를', '도울 수 있는 지원이에요.', '자세한 조건은 앱에서 확인하세요.'],
  },
  job: {
    title: '일자리 지원',
    icon: '💼',
    lines: ['취업 상담과 직무 훈련을', '도와주는 지원이에요.', '모집 정보는 앱에서 확인하세요.'],
  },
  education: {
    title: '교육 지원',
    icon: '📚',
    lines: ['학습과 자격 교육을', '도울 수 있는 지원이에요.', '신청 정보는 앱에서 확인하세요.'],
  },
  safety: {
    title: '재난/안전 정보',
    icon: '🚨',
    lines: ['긴급 상황과 안전 안내를', '확인할 수 있어요.', '자세한 알림은 앱에서 확인하세요.'],
  },
}

export function VoiceChatbot({
  alert,
  alertQueue = [],
  embedded = false,
  isPaired = true,
  mode,
  notificationSettings = { voiceGuide: true, vibrationGuide: true },
  onOpenChange,
  onSpeakingChange,
  onWakeListeningChange,
  showFab = true,
  statusMessage,
  uwbSession,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentChatScreen, setCurrentChatScreen] = useState('start')
  const [selectedPhrase, setSelectedPhrase] = useState('')
  const [selectedPhraseIcon, setSelectedPhraseIcon] = useState('')
  const [selectedQuestion, setSelectedQuestion] = useState('alert')
  const [selectedWelfareType, setSelectedWelfareType] = useState('')
  const [selectedAiCategory, setSelectedAiCategory] = useState('welfare')
  const [selectedAiQuestion, setSelectedAiQuestion] = useState(null)
  const [welfareBaseCard, setWelfareBaseCard] = useState(null)
  const [lastAiContext, setLastAiContext] = useState(null)
  const [voiceStatus, setVoiceStatus] = useState('챗봇 켜줘 라고 말하면 시작해요.')
  const [transcript, setTranscript] = useState('')
  const [chatResponse, setChatResponse] = useState(null)
  const [, setIsListening] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  const [conversationState, setConversationState] = useState(CONVERSATION_STATE.IDLE)

  const recognitionRef = useRef(null)
  const recognitionSessionIdRef = useRef(0)
  const wakeRecognitionRef = useRef(null)
  const wakeRestartTimerRef = useRef(null)
  const wakeSilenceTimerRef = useRef(null)
  const wakeStartGuardTimerRef = useRef(null)
  const userSilenceTimerRef = useRef(null)
  const waitingUserTimerRef = useRef(null)
  const recognitionWatchdogTimerRef = useRef(null)
  const isOpenRef = useRef(false)
  const autoListenRef = useRef(false)
  const latestTranscriptRef = useRef('')
  const wakeTranscriptRef = useRef('')
  const wakeMatchedRef = useRef(false)
  const userSpeechHandledRef = useRef(false)
  const idlePromptGivenRef = useRef(false)
  const lastSpokenTextRef = useRef('')
  const pendingActionRef = useRef(null)
  const lastAlertSummaryRef = useRef('')
  const activeVoiceUwbSessionRef = useRef(null)
  const uwbPollingTimerRef = useRef(null)
  const lastUwbGuideZoneRef = useRef('')
  const microphoneReadyRef = useRef(false)

  const answers = useMemo(
    () => createAnswers({ alert, alertQueue, isPaired, mode, statusMessage, uwbSession }),
    [alert, alertQueue, isPaired, mode, statusMessage, uwbSession],
  )
  const selectedAnswer =
    selectedQuestion === 'welfare'
      ? createWelfareAnswer(selectedWelfareType)
      : answers[selectedQuestion] || answers.alert
  const voiceFeedbackEnabled = notificationSettings.voiceGuide === true
  const vibrationFeedbackEnabled = notificationSettings.vibrationGuide === true
  const supportsSpeechRecognition = Boolean(getSpeechRecognitionConstructor())

  useEffect(() => {
    isOpenRef.current = isOpen
    onOpenChange?.(isOpen)
  }, [isOpen, onOpenChange])

  useEffect(() => {
    chatbotSpeakingChangeHandler = onSpeakingChange || null
    return () => {
      if (chatbotSpeakingChangeHandler === onSpeakingChange) {
        chatbotSpeakingChangeHandler = null
      }
    }
  }, [onSpeakingChange])

  useEffect(() => {
    if (!supportsSpeechRecognition || isOpen) {
      stopWakeListening()
      return undefined
    }

    startWakeListening()
    const wakeHealthCheckTimer = window.setInterval(() => {
      if (!isOpenRef.current && !wakeRecognitionRef.current) {
        startWakeListening()
      }
    }, 1600)

    return () => {
      window.clearInterval(wakeHealthCheckTimer)
      stopWakeListening()
    }
    // Wake listening is intentionally tied only to support/open state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, supportsSpeechRecognition])

  useEffect(
    () => () => {
      stopWakeListening()
      stopRecognition()
      clearConversationTimers()
      stopUwbPolling()
      onWakeListeningChange?.(false)
      clearSpeechTimers()
      setChatbotSpeaking(false)
      setChatbotAudioLock(false)
      globalThis.speechSynthesis?.cancel?.()
    },
    // Cleanup should only run when the component unmounts or callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onWakeListeningChange],
  )

  useEffect(() => {
    globalThis.__ABLE_BAND_OPEN_WEARABLE_CHATBOT__ = () => openChatbot({ fromWake: true })

    function handleExternalWake() {
      openChatbot({ fromWake: true })
    }

    globalThis.addEventListener?.('lg-able-band:open-wearable-chatbot', handleExternalWake)
    return () => {
      if (globalThis.__ABLE_BAND_OPEN_WEARABLE_CHATBOT__) {
        delete globalThis.__ABLE_BAND_OPEN_WEARABLE_CHATBOT__
      }
      globalThis.removeEventListener?.('lg-able-band:open-wearable-chatbot', handleExternalWake)
    }
    // External wake bridge is registered once for the mounted wearable chatbot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openChatbot({ fromWake = false, autoListen = fromWake } = {}) {
    isOpenRef.current = true
    autoListenRef.current = autoListen
    latestTranscriptRef.current = ''
    userSpeechHandledRef.current = false
    idlePromptGivenRef.current = false
    microphoneReadyRef.current = false
    clearConversationTimers()
    setConversationState(fromWake ? CONVERSATION_STATE.WAKE_DETECTED : CONVERSATION_STATE.IDLE)
    setChatbotAudioLock(true)
    onOpenChange?.(true)
    stopWakeListening()
    setIsOpen(true)
    setCurrentChatScreen('start')
    setSelectedPhrase('')
    setSelectedPhraseIcon('')
    setSelectedQuestion('alert')
    setSelectedWelfareType('')
    setTranscript('')
    setChatResponse({
      title: 'AI 챗봇',
      text: CHATBOT_INTRO,
      quickReplies: [],
    })
    setVoiceStatus(fromWake ? '챗봇 호출을 감지했어요.' : 'AI 챗봇을 실행했어요.')

    if (autoListen) {
      void beginVoiceConversation()
    }
  }

  function closeChatbot() {
    isOpenRef.current = false
    autoListenRef.current = false
    latestTranscriptRef.current = ''
    userSpeechHandledRef.current = false
    idlePromptGivenRef.current = false
    microphoneReadyRef.current = false
    clearConversationTimers()
    stopUwbPolling()
    stopRecognition()
    clearSpeechTimers()
    setChatbotSpeaking(false)
    setChatbotAudioLock(false)
    globalThis.speechSynthesis?.cancel?.()
    setIsOpen(false)
    setIsListening(false)
    setIsRequesting(false)
    setConversationState(CONVERSATION_STATE.IDLE)
    setVoiceStatus('챗봇을 종료했어요.')
    setCurrentChatScreen('start')
    setSelectedPhrase('')
    setSelectedPhraseIcon('')
    setSelectedQuestion('alert')
    setSelectedWelfareType('')
    setTranscript('')
    setChatResponse({
      title: 'AI 챗봇',
      text: CHATBOT_INTRO,
      quickReplies: [],
    })
  }

  function startVoiceFromInitialScreen() {
    if (embedded && !isOpenRef.current) {
      openChatbot({ fromWake: true, autoListen: true })
      return
    }

    startVoiceTurn()
  }

  async function beginVoiceConversation() {
    if (!isOpenRef.current) {
      return
    }

    await playTurnBeep()
    if (!isOpenRef.current) {
      return
    }

    runAiTurn(CHATBOT_INTRO)
  }

  function selectPhrase(phrase) {
    setSelectedPhrase(phrase.text)
    setSelectedPhraseIcon(phrase.icon)
    setCurrentChatScreen('speaking')
    sendPhraseToApp(phrase.text)
    speakText(phrase.text)
    requestAppTTS(phrase.text)
  }

  function selectWelfareType(welfareType) {
    setSelectedQuestion('welfare')
    setSelectedWelfareType(welfareType)
    setCurrentChatScreen('answer')
    speakText(createWelfareAnswer(welfareType).lines.join(' '))
  }

  function selectAiCategory(categoryId) {
    stopChatbotSpeech()
    setSelectedAiCategory(categoryId)
    setSelectedAiQuestion(null)
    setWelfareBaseCard(null)
    setLastAiContext(null)
    setChatResponse(null)
    setCurrentChatScreen('recommendations')
    setVoiceStatus('추천 질문을 선택하세요.')
  }

  async function selectRecommendedQuestion(question) {
    if (question?.direct) {
      startVoiceFromInitialScreen()
      return
    }

    await requestWearableAiQuestion({
      categoryId: selectedAiCategory,
      question,
      query: question?.query || question?.label || '',
    })
  }

  async function selectFollowup(followup) {
    if (followup?.id === 'other') {
      setCurrentChatScreen('recommendations')
      return
    }

    const baseQuery =
      lastAiContext?.lastInfoAgent?.query ||
      selectedAiQuestion?.query ||
      selectedAiQuestion?.label ||
      ''
    const query = [baseQuery, followup?.query].filter(Boolean).join(' ').trim()

    if (
      selectedAiCategory === 'welfare' &&
      ['apply', 'contact', 'target'].includes(followup?.id) &&
      !['apply', 'contact', 'target'].includes(selectedAiQuestion?.id) &&
      chatResponse
    ) {
      setWelfareBaseCard({
        question: selectedAiQuestion,
        response: chatResponse,
        context: lastAiContext,
      })
    }

    await requestWearableAiQuestion({
      categoryId: selectedAiCategory,
      question: {
        id: followup?.id || 'followup',
        label: followup?.label || '후속 질문',
        query,
      },
      query,
      isFollowup: true,
    })
  }

  function returnToWelfareBaseCard() {
    if (!welfareBaseCard) {
      return
    }

    stopChatbotSpeech()
    setSelectedAiCategory('welfare')
    setSelectedAiQuestion(welfareBaseCard.question)
    setChatResponse(welfareBaseCard.response)
    setLastAiContext(welfareBaseCard.context)
    setCurrentChatScreen('aiCard')
  }

  async function requestWearableAiQuestion({
    categoryId = selectedAiCategory,
    question,
    query,
    isFollowup = false,
  }) {
    const requestText = String(query || question?.query || question?.label || '').trim()
    if (!requestText || isRequesting) {
      return
    }

    stopChatbotSpeech()
    setSelectedAiCategory(categoryId)
    setSelectedAiQuestion(question)
    setIsRequesting(true)
    setCurrentChatScreen('aiCard')
    setVoiceStatus('AI 답변을 준비 중이에요.')
    setChatResponse(createWearableAiLoadingResponse(question, requestText))

    try {
      if (categoryId === 'safety') {
        const currentAlerts = await getCurrentAlerts().catch(() => [alert, ...alertQueue].filter(Boolean))
        const structuredResult = await handleStructuredVoiceCommand({
          currentTask: null,
          text: requestText,
          context: {
            source: 'wearable',
            summary: {
              recentAlerts: currentAlerts,
              unreadAlerts: getUnreadAlerts(currentAlerts),
            },
          },
        })

        if (structuredResult.handled) {
          const data = {
            answerText: structuredResult.responseText,
            voiceText: structuredResult.responseText,
            alerts: structuredResult.result?.data?.alerts || [],
            intent: 'READ_ALERTS',
            action: 'READ_ALERTS',
          }
          const normalized = normalizeWearableAiResponse(data, {
            categoryId,
            question,
            query: requestText,
            context: lastAiContext || {},
          })
          setChatResponse(normalized)
          setLastAiContext(normalized.context)
          setVoiceStatus('답변을 불러왔어요.')
          speakText(normalized.voiceMessage || normalized.summary)
          return
        }
      }

      const data = await requestVoiceChat({
        sessionId: 'wearable-demo',
        text: requestText,
        language: 'ko-KR',
        user: {
          userId: 1,
          accessibilityType: 'VISUAL',
          guardianLinked: true,
        },
        context: {
          source: 'wearable',
          categoryId,
          ...(lastAiContext ? { lastInfoAgent: lastAiContext.lastInfoAgent } : {}),
          ...(isFollowup && lastAiContext?.selectedDocument
            ? { selectedDocument: lastAiContext.selectedDocument }
            : {}),
        },
      })
      const normalized = normalizeWearableAiResponse(data, {
        categoryId,
        question,
        query: requestText,
        context: lastAiContext || {},
      })
      setChatResponse(normalized)
      setLastAiContext(normalized.context)
      setVoiceStatus('답변을 불러왔어요.')
      speakText(normalized.voiceMessage || normalized.summary)
    } catch {
      const fallback = createWearableAiFallbackResponse({
        categoryId,
        question,
        query: requestText,
        context: lastAiContext || {},
      })
      setChatResponse(fallback)
      setLastAiContext(fallback.context)
      setVoiceStatus('기본 안내를 보여드릴게요.')
      speakText(fallback.voiceMessage || fallback.summary)
    } finally {
      setIsRequesting(false)
    }
  }

  function isNotificationAnswer(answer) {
    return ['alert', 'uwb'].includes(answer?.appPayload?.type)
  }

  async function startVoiceTurn() {
    const SpeechRecognition = getSpeechRecognitionConstructor()
    if (!SpeechRecognition) {
      const message = '이 브라우저는 마이크 인식을 지원하지 않아요.'
      setVoiceStatus(message)
      runAiTurn(message)
      return
    }

    clearConversationTimers()
    stopRecognition()

    if (!microphoneReadyRef.current) {
      const microphoneError = await checkMicrophoneAvailability()
      if (microphoneError) {
        console.warn('마이크 준비 실패:', microphoneError)
        setIsListening(false)
        setCurrentChatScreen('listening')
        setVoiceStatus(microphoneError)
        scheduleMicrophoneRetry()
        return
      }
      microphoneReadyRef.current = true
    }

    const sessionId = recognitionSessionIdRef.current + 1
    recognitionSessionIdRef.current = sessionId
    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 3
    recognitionRef.current = recognition
    latestTranscriptRef.current = ''
    userSpeechHandledRef.current = false

    recognition.onstart = () => {
      if (!isActiveRecognition(recognition, sessionId)) {
        return
      }
      setIsListening(true)
      setCurrentChatScreen('listening')
      setConversationState(CONVERSATION_STATE.WAITING_USER)
      setVoiceStatus('말씀해주세요.')
      setTranscript('')
      scheduleWaitingUserPrompt()
      markRecognitionActivity()
    }

    recognition.onresult = (event) => {
      if (!isActiveRecognition(recognition, sessionId)) {
        return
      }
      markRecognitionActivity()
      const nextTranscript = cleanupRecognizedSpeech(
        Array.from(event.results)
          .map((result) => getRecognitionAlternatives(result)[0] || '')
          .join(' ')
          .trim(),
      )
      const heardCandidates = Array.from(event.results)
        .flatMap((result) => getRecognitionAlternatives(result))
        .filter(Boolean)
      const hasMeaningfulTranscript = isMeaningfulTranscript(nextTranscript)

      setTranscript(nextTranscript)
      if (nextTranscript) {
        console.log('STT 인식 결과:', nextTranscript, heardCandidates)
      }

      if (!hasMeaningfulTranscript) {
        return
      }

      latestTranscriptRef.current = nextTranscript
      clearWaitingUserTimer()
      setConversationState(CONVERSATION_STATE.USER_SPEAKING)
      setVoiceStatus('사용자 발화 중...')
      scheduleUserSpeechEnd(nextTranscript)
    }

    recognition.onaudiostart = () => {
      if (!isActiveRecognition(recognition, sessionId)) {
        return
      }
      markRecognitionActivity()
    }

    recognition.onsoundstart = () => {
      if (!isActiveRecognition(recognition, sessionId)) {
        return
      }
      markRecognitionActivity()
    }

    recognition.onspeechstart = () => {
      if (!isActiveRecognition(recognition, sessionId)) {
        return
      }
      markRecognitionActivity()
      setConversationState(CONVERSATION_STATE.USER_SPEAKING)
      setVoiceStatus('사용자 발화 중...')
    }

    recognition.onspeechend = () => {
      if (!isActiveRecognition(recognition, sessionId)) {
        return
      }
      markRecognitionActivity()
      if (isMeaningfulTranscript(latestTranscriptRef.current)) {
        scheduleUserSpeechEnd(latestTranscriptRef.current)
      }
    }

    recognition.onerror = (event) => {
      if (!isActiveRecognition(recognition, sessionId)) {
        return
      }
      clearRecognitionWatchdog()
      setIsListening(false)
      if (event?.error === 'aborted') {
        return
      }

      console.warn('STT 오류:', event?.error || event)
      if (event?.error === 'no-speech') {
        if (isOpenRef.current && !userSpeechHandledRef.current) {
          setVoiceStatus('말씀해주세요.')
          window.setTimeout(() => startVoiceTurn(), 1200)
        }
        return
      }

      setCurrentChatScreen('start')
      setVoiceStatus('마이크 권한을 확인해주세요.')
      microphoneReadyRef.current = false
      runAiTurn('마이크 권한을 확인해주세요.')
    }

    recognition.onend = () => {
      if (!isActiveRecognition(recognition, sessionId)) {
        return
      }
      clearRecognitionWatchdog()
      setIsListening(false)
      if (isOpenRef.current && latestTranscriptRef.current && !userSpeechHandledRef.current) {
        finishUserSpeech(latestTranscriptRef.current)
        return
      }
      if (isOpenRef.current && !latestTranscriptRef.current && !userSpeechHandledRef.current) {
        setVoiceStatus('말씀해주세요.')
        window.setTimeout(() => {
          if (isOpenRef.current && !latestTranscriptRef.current && !userSpeechHandledRef.current) {
            startVoiceTurn()
          }
        }, USER_RESTART_DELAY_MS)
      }
    }

    try {
      recognition.start()
    } catch (error) {
      console.warn('STT 시작 실패:', error)
      setVoiceStatus('마이크를 다시 여는 중이에요.')
      window.setTimeout(() => {
        if (isOpenRef.current && !userSpeechHandledRef.current) {
          startVoiceTurn()
        }
      }, USER_RESTART_DELAY_MS)
    }
  }

  function finishUserSpeech(text) {
    const spokenText = String(text || latestTranscriptRef.current || '').trim()
    if (userSpeechHandledRef.current) {
      return
    }

    if (!isMeaningfulTranscript(spokenText)) {
      setVoiceStatus('말을 기다리는 중...')
      startVoiceTurn()
      return
    }

    userSpeechHandledRef.current = true
    clearUserSilenceTimer()
    clearWaitingUserTimer()
    stopRecognition()
    setIsListening(false)
    setConversationState(CONVERSATION_STATE.USER_SPEECH_ENDED)
    setVoiceStatus('사용자 발화가 끝났어요.')
    void handleRecognizedText(spokenText)
  }

  async function handleRecognizedText(text) {
    const spokenText = text.trim()
    const normalizedText = normalizeSpeechText(spokenText)

    if (!normalizedText) {
      setVoiceStatus('잘 못 들었어요.')
      runAiTurn('잘 못 들었어요. 다시 말씀해주세요.')
      return
    }

    if (shouldOpenChatbot(spokenText)) {
      runAiTurn('AI 챗봇이 실행 중이에요. 원하시는 기능을 말씀해주세요.')
      return
    }

    setTranscript(spokenText)
    setVoiceStatus(`인식: ${spokenText}`)
    const intent = classifyVoiceIntent(spokenText)

    console.log('Wearable voice chatbot intent:', { text: spokenText, intent })
    setConversationState(CONVERSATION_STATE.PROCESSING)
    setIsRequesting(true)
    setCurrentChatScreen('voiceAnswer')
    setVoiceStatus(`Intent: ${intent}`)
    try {
      const actionResult = await handleVoiceIntent(intent, spokenText)
      setChatResponse({
        title: intent,
        text: actionResult.text,
        notificationFeedback: Boolean(actionResult.notificationFeedback),
        quickReplies: [],
      })
      runAiTurn(actionResult.text, {
        closeAfter: actionResult.closeAfter,
        notificationFeedback: Boolean(actionResult.notificationFeedback),
        voiceEnabled: !actionResult.notificationFeedback || voiceFeedbackEnabled,
      })
    } finally {
      setIsRequesting(false)
    }
  }

  async function handleVoiceIntent(intent, spokenText) {
    const pendingAction = pendingActionRef.current

    if (intent === VOICE_INTENT.GO_IDLE) {
      pendingActionRef.current = null
      return {
        text: normalizeSpeechText(spokenText).includes('챗봇꺼') ? '알겠습니다.' : '대기 모드로 돌아갑니다. 필요한 일이 생기면 다시 불러주세요.',
        closeAfter: true,
      }
    }

    if (intent === VOICE_INTENT.NO) {
      pendingActionRef.current = null
      return { text: '진행 중인 작업을 취소했어요.' }
    }

    if (intent === VOICE_INTENT.CANCEL) {
      pendingActionRef.current = null
      return { text: '안내를 중단했어요.' }
    }

    if (intent === VOICE_INTENT.GO_START) {
      pendingActionRef.current = null
      return { text: '처음으로 돌아갈게요. 필요한 기능을 말씀해주세요.' }
    }

    if (intent === VOICE_INTENT.REPEAT) {
      return { text: lastSpokenTextRef.current || '방금 안내를 다시 들려드릴게요.' }
    }

    if (pendingAction?.type === 'substituteSpeech' && intent !== VOICE_INTENT.YES) {
      pendingActionRef.current = { type: 'substituteConfirm', phrase: spokenText }
      return { text: `${spokenText}. 이 문장으로 전달할까요?` }
    }

    if (pendingAction?.type === 'welfareAssistive' && intent === VOICE_INTENT.YES) {
      pendingActionRef.current = null
      return {
        text: '신청은 주민센터나 복지 관련 기관을 통해 진행할 수 있어요. 필요한 경우 보호자에게 이 정보를 전달할 수도 있어요.',
      }
    }

    if (pendingAction && intent === VOICE_INTENT.YES) {
      return runPendingVoiceAction(pendingAction)
    }

    if (pendingAction?.type === 'guardian' && intent === VOICE_INTENT.YES) {
      return runPendingVoiceAction(pendingAction)
    }

    if (
      (pendingAction?.type === 'guardian' || pendingAction?.type === 'guardianConfirm') &&
      (intent === VOICE_INTENT.GUARDIAN_CONNECT || intent === VOICE_INTENT.SHARE_TO_GUARDIAN)
    ) {
      pendingActionRef.current = { type: 'emergencySend' }
      return withNotificationFeedback({ text: '보호자에게 긴급 요청을 다시 보낼게요. 보내려면 네라고 말해주세요.' })
    }

    switch (intent) {
      case VOICE_INTENT.READ_ALERTS:
        return normalizeSpeechText(spokenText).includes('긴급') ? handleReadUrgentAlert() : handleReadAlerts()
      case VOICE_INTENT.READ_APPLIANCE_STATUS:
        return handleReadApplianceStatus(spokenText)
      case VOICE_INTENT.FIND_WASHER:
        return handleFindDevice('세탁기')
      case VOICE_INTENT.FIND_FRIDGE:
        return handleFindDevice('냉장고')
      case VOICE_INTENT.GUARDIAN_CONNECT:
        notifyVibration('STRONG')
        pendingActionRef.current = { type: 'guardianConfirm' }
        return withNotificationFeedback({ text: '보호자에게 도움 요청을 보낼까요? 보내려면 보내줘, 취소하려면 취소라고 말해주세요.' })
      case VOICE_INTENT.EMERGENCY_REQUEST:
        notifyVibration('STRONG')
        pendingActionRef.current = { type: 'emergencySend' }
        return withNotificationFeedback({ text: '보호자에게 긴급 요청을 보낼게요. 정말 보낼까요?' })
      case VOICE_INTENT.SUBSTITUTE_SPEECH:
        pendingActionRef.current = { type: 'substituteSpeech' }
        return { text: '전하고 싶은 말을 말씀해주세요. 제가 대신 전달할 문장으로 준비할게요.' }
      case VOICE_INTENT.WELFARE_INFO:
        return { text: '복지 정보를 안내할게요. 장애인 활동지원, 보조기기 지원, 긴급 돌봄, 보호자 연계 정보를 들을 수 있어요. 어떤 정보가 필요하신가요?' }
      case VOICE_INTENT.WELFARE_ASSISTIVE_DEVICE:
        pendingActionRef.current = { type: 'welfareAssistive' }
        return { text: '보조기기 지원은 필요한 보조기기를 신청하거나 대여할 수 있는 제도예요. 자세한 신청 방법을 이어서 들려드릴까요?' }
      case VOICE_INTENT.SHARE_TO_GUARDIAN:
        return { text: '보호자에게 복지 정보 안내를 전달할게요.' }
      case VOICE_INTENT.CONFIRM_DONE:
        return handleConfirmAlerts()
      case VOICE_INTENT.STOP_UWB:
        return handleStopUwb()
      case VOICE_INTENT.OPEN_CHATBOT:
        return { text: CHATBOT_INTRO }
      case VOICE_INTENT.YES:
        return { text: '진행할 작업을 먼저 말씀해주세요.' }
      case VOICE_INTENT.UNKNOWN:
      default:
        return { text: createIntentVoiceResponse(intent, spokenText) }
    }
  }

  async function runPendingVoiceAction(action) {
    if (action.type === 'guardianConfirm') {
      pendingActionRef.current = { type: 'emergencySend' }
      return { text: '보호자에게 지금 도움이 필요하다는 알림을 보낼게요. 정말 보낼까요?' }
    }

    if (action.type === 'emergencySend') {
      pendingActionRef.current = null
      try {
        const response = await requestWearableEmergencyHelp('웨어러블 음성 챗봇에서 긴급 요청')
        notifyVibration('LONG_TWICE')
        const delivered = response?.guardianTargets?.some((target) => target.deliveryStatus === 'SENT')
        return withNotificationFeedback({
          text: delivered
            ? '긴급 요청을 보냈어요. 보호자에게 요청이 전달됐어요.'
            : '긴급 요청을 보냈어요. 보호자 앱 수신 상태를 확인하고 있어요.',
        })
      } catch {
        return { text: '요청 전송에 실패했어요. 연결 상태를 확인한 뒤 다시 시도할게요.' }
      }
    }

    if (action.type === 'substituteConfirm') {
      pendingActionRef.current = null
      return { text: '문장을 준비했어요. 다시 말하려면 다시 말할래라고 해주세요.' }
    }

    return { text: '진행 중인 작업을 찾지 못했어요. 필요한 기능을 다시 말씀해주세요.' }
  }

  async function handleReadAlerts() {
    const unreadAlerts = await loadUnreadAlerts()
    if (!unreadAlerts.length) {
      lastAlertSummaryRef.current = '현재 새 알림은 없어요.'
      return { text: '현재 새 알림은 없어요.' }
    }

    const urgentAlerts = unreadAlerts.filter(isUrgentAlert)
    const lifeAlerts = unreadAlerts.filter((item) => !isUrgentAlert(item))
    const firstUrgent = urgentAlerts[0]
    const firstLife = lifeAlerts[0]
    const lines = [
      `새 알림이 ${unreadAlerts.length}개 있어요. 긴급 알림 ${urgentAlerts.length}개, 생활 알림 ${lifeAlerts.length}개입니다.`,
    ]

    if (firstUrgent) {
      notifyVibration(vibrationPatternForAlert(firstUrgent))
      lines.push('긴급 알림부터 들려드릴게요.')
      lines.push(formatAlertSpeech(firstUrgent, { includeTime: false }))
      notifyShortVibration(2)
    }

    if (firstLife) {
      lines.push(`다음은 생활 알림입니다. ${firstLife.title || firstLife.message || '생활 알림이 감지됐어요.'}`)
    }

    lines.push('알림을 다시 듣고 싶으면 다시 들려줘라고 말해주세요. 확인 완료하려면 확인했어라고 말해주세요.')
    const text = lines.join(' ')
    lastAlertSummaryRef.current = text
    pendingActionRef.current = { type: 'confirmAlerts', alertIds: unreadAlerts.map((item) => item.alertId).filter(Boolean) }
    return withNotificationFeedback({ text })
  }

  async function handleReadUrgentAlert() {
    const unreadAlerts = await loadUnreadAlerts()
    const urgentAlert = unreadAlerts.find(isUrgentAlert) || alertQueue.find(isUrgentAlert)
    if (!urgentAlert) {
      return { text: '현재 긴급 알림은 없어요.' }
    }

    notifyVibration('STRONG')
    pendingActionRef.current = { type: 'guardianConfirm' }
    const text = `${formatAlertSpeech(urgentAlert, { includeTime: true })} 보호자에게 다시 연락하려면 보호자에게 보내줘라고 말해주세요. 취소하려면 취소라고 말해주세요.`
    lastAlertSummaryRef.current = text
    return withNotificationFeedback({ text })
  }

  async function handleReadApplianceStatus(spokenText = '') {
    const appliances = await loadWearableAppliances()
    const requestedDeviceName = getRequestedApplianceName(spokenText)
    if (requestedDeviceName) {
      const appliance = appliances.find((item) => item.name?.includes(requestedDeviceName))
      if (!appliance) {
        return {
          text: `${requestedDeviceName} 상태를 확인했어요. 현재 연결된 ${requestedDeviceName} 정보를 찾지 못했어요.`,
        }
      }

      const statusText = formatApplianceStatus(appliance)
      return {
        text: `${requestedDeviceName} 상태를 확인했어요. ${appliance.name || requestedDeviceName}은 ${statusText}. 위치 안내가 필요하면 ${requestedDeviceName} 찾아줘라고 말해주세요.`,
      }
    }

    const connectedNames = appliances.map((item) => item.name).filter(Boolean)
    return {
      text: `현재 연결된 가전은 ${connectedNames.length}개예요. ${joinKoreanList(connectedNames)}가 연결되어 있어요. 위치 안내가 필요하면 세탁기 찾아줘 또는 냉장고 찾아줘라고 말해주세요.`,
    }
  }

  async function handleFindDevice(deviceName) {
    notifyShortVibration(1)
    pendingActionRef.current = null

    try {
      const appliances = await loadWearableAppliances()
      const appliance = appliances.find((item) => item.name?.includes(deviceName))
      const targets = await getUwbTargets()
      const target =
        targets.find((item) => item.name?.includes(deviceName)) ||
        targets.find((item) => item.deviceId === appliance?.deviceId)
      if (!target) {
        return {
          text: '연결된 위치 안내 기기를 찾고 있어요. 위치 안내 기기를 찾지 못했어요. 기기가 켜져 있는지 확인이 필요해요.',
        }
      }

      const session = await startWearableUwbSession({
        targetDeviceId: target.deviceId,
        type: target.type || appliance?.type,
        name: target.name || appliance?.name || deviceName,
      })
      activeVoiceUwbSessionRef.current = session
      startUwbPolling(session.sessionId)
      notifyVibration(session.vibrationPattern || 'MEDIUM')
      return withNotificationFeedback({
        text: `위치 안내 기기와 연결됐어요. ${deviceName} 위치 안내를 시작합니다. 가까워질수록 진동이 빨라집니다. 안내를 멈추려면 탐색 종료라고 말해주세요.`,
      })
    } catch {
      return {
        text: '위치 안내 기기를 찾지 못했어요. 기기가 켜져 있는지 확인이 필요해요.',
      }
    }
  }

  async function handleConfirmAlerts() {
    const pendingAlertIds =
      pendingActionRef.current?.type === 'confirmAlerts' ? pendingActionRef.current.alertIds : []
    const alertIds = pendingAlertIds.length
      ? pendingAlertIds
      : (await loadUnreadAlerts()).map((item) => item.alertId).filter(Boolean)

    if (!alertIds.length) {
      pendingActionRef.current = null
      return { text: '확인 완료 처리할 알림이 없어요.' }
    }

    try {
      await markWearableAlertsRead(alertIds)
      pendingActionRef.current = null
      notifyVibration('MEDIUM')
      return withNotificationFeedback({ text: '현재 알림을 확인 완료 처리했어요.' })
    } catch {
      return { text: '알림 확인 완료 처리에 실패했어요. 잠시 뒤 다시 시도해주세요.' }
    }
  }

  async function handleStopUwb() {
    const sessionId = activeVoiceUwbSessionRef.current?.sessionId || uwbSession?.sessionId
    if (!sessionId) {
      return { text: '진행 중인 위치 안내가 없어요.' }
    }

    try {
      stopUwbPolling()
      await stopWearableUwbSession(sessionId)
      activeVoiceUwbSessionRef.current = null
      notifyVibration('SLOW')
      return withNotificationFeedback({ text: '위치 안내를 종료했어요.' })
    } catch {
      return { text: '위치 안내 종료에 실패했어요. 잠시 뒤 다시 시도해주세요.' }
    }
  }

  function startUwbPolling(sessionId) {
    stopUwbPolling()
    if (!sessionId) {
      return
    }

    lastUwbGuideZoneRef.current = ''

    async function poll() {
      try {
        const session = await getWearableUwbSession(sessionId)
        activeVoiceUwbSessionRef.current = session
        const status = String(session.status || session.navigationStatus || '').toUpperCase()

        if (['STOPPED', 'CANCELED', 'CANCELLED', 'FAILED'].includes(status)) {
          stopUwbPolling()
          return
        }

        const guide = createUwbDistanceGuide(session)
        if (guide && guide.zone !== lastUwbGuideZoneRef.current) {
          lastUwbGuideZoneRef.current = guide.zone
          notifyVibration(guide.vibrationPattern)
          runAiTurn(guide.message, {
            notificationFeedback: true,
            voiceEnabled: voiceFeedbackEnabled,
          })
        }

        if (guide?.zone === 'ARRIVED' || status === 'ARRIVED') {
          stopUwbPolling()
          return
        }
      } catch {
        stopUwbPolling()
        runAiTurn('위치 안내 정보를 확인하지 못했어요. 연결 상태를 확인해주세요.')
        return
      }

      uwbPollingTimerRef.current = window.setTimeout(poll, UWB_POLL_INTERVAL_MS)
    }

    uwbPollingTimerRef.current = window.setTimeout(poll, UWB_POLL_INTERVAL_MS)
  }

  function stopUwbPolling() {
    window.clearTimeout(uwbPollingTimerRef.current)
    uwbPollingTimerRef.current = null
    lastUwbGuideZoneRef.current = ''
  }

  async function loadUnreadAlerts() {
    try {
      return await getUnreadWearableAlerts()
    } catch {
      return getUnreadAlerts(alertQueue)
    }
  }

  async function loadWearableAppliances() {
    try {
      const appliances = await getWearableAppliances()
      if (appliances.length) {
        return appliances
      }
    } catch {
      // Fall back to the wearable screen state below.
    }

    return getConnectedApplianceNames(alertQueue, uwbSession).map((name, index) => ({
      applianceId: index + 1,
      deviceId: index + 1,
      name,
      type: name.includes('세탁') ? 'WASHER' : name.includes('냉장') ? 'FRIDGE' : 'APPLIANCE',
      connectionStatus: 'CONNECTED',
    }))
  }

  function notifyVibration(pattern) {
    if (!vibrationFeedbackEnabled) {
      return false
    }

    return triggerVibration(pattern)
  }

  function notifyShortVibration(count = 1) {
    if (!vibrationFeedbackEnabled) {
      return false
    }

    triggerShortVibration(count)
    return true
  }

  function withNotificationFeedback(result) {
    return { ...result, notificationFeedback: true }
  }

  function runAiTurn(
    text,
    { closeAfter = false, notificationFeedback = false, voiceEnabled = true } = {},
  ) {
    stopRecognition()
    clearConversationTimers()
    setIsListening(false)
    lastSpokenTextRef.current = text
    setCurrentChatScreen('voiceAnswer')
    setConversationState(CONVERSATION_STATE.AI_SPEAKING)
    setVoiceStatus('AI 챗봇이 말하는 중...')
    setChatResponse((current) => ({
      title: current?.title || 'AI 챗봇',
      text,
      notificationFeedback,
      quickReplies: current?.quickReplies || [],
    }))

    const handleSpeechEnd = async () => {
      setConversationState(CONVERSATION_STATE.AI_SPEECH_ENDED)
      setVoiceStatus('AI 음성이 끝났어요.')

      if (!isOpenRef.current) {
        return
      }

      if (closeAfter) {
        closeChatbot()
        return
      }

      if (isOpenRef.current) {
        void beginUserListeningTurn()
      }
    }

    if (!voiceEnabled) {
      void handleSpeechEnd()
      return
    }

    speakText(text, { onEnd: handleSpeechEnd })
  }

  function goBack() {
    stopChatbotSpeech()

    if (currentChatScreen === 'start' || (embedded && !isOpen)) {
      closeChatbot()
      return
    }

    const previousScreen = {
      speak: 'start',
      speakMore: 'speak',
      speaking: 'speak',
      ask: 'start',
      recommendations: 'ask',
      aiCard: 'recommendations',
      welfareSelect: 'ask',
      welfareMore: 'welfareSelect',
      answer: 'ask',
      listening: 'start',
      thinking: 'start',
      voiceAnswer: 'start',
    }[currentChatScreen]

    setCurrentChatScreen(
      currentChatScreen === 'answer' && selectedQuestion === 'welfare'
        ? 'welfareSelect'
        : previousScreen || 'start',
    )
  }

  function startWakeListening() {
    const SpeechRecognition = getSpeechRecognitionConstructor()
    if (!SpeechRecognition || isOpenRef.current || wakeRecognitionRef.current) {
      return
    }

    setChatbotAudioLock(false)
    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.interimResults = true
    recognition.continuous = true
    recognition.maxAlternatives = 5
    wakeTranscriptRef.current = ''
    wakeRecognitionRef.current = recognition

    recognition.onstart = () => {
      window.clearTimeout(wakeStartGuardTimerRef.current)
      onWakeListeningChange?.(true)
      setVoiceStatus('챗봇 켜줘 라고 말하면 바로 시작해요.')
      wakeMatchedRef.current = false
      wakeTranscriptRef.current = ''
      scheduleWakeWatchdog()
    }

    recognition.onresult = (event) => {
      scheduleWakeWatchdog()
      const heardCandidates = Array.from(event.results)
        .flatMap((result) => getRecognitionAlternatives(result))
        .filter(Boolean)
      const heard = cleanupRecognizedSpeech(heardCandidates.join(' '))

      wakeTranscriptRef.current = `${wakeTranscriptRef.current} ${heard}`.slice(-160)
      console.log('STT 인식 결과:', heard, heardCandidates)

      if (shouldOpenChatbot(`${heard} ${wakeTranscriptRef.current}`)) {
        wakeMatchedRef.current = true
        setConversationState(CONVERSATION_STATE.WAKE_DETECTED)
        setVoiceStatus('챗봇 호출을 들었어요.')
        finishWakeSpeech()
      }

      const lastResult = event.results[event.results.length - 1]
      if (wakeMatchedRef.current && lastResult?.isFinal) {
        finishWakeSpeech()
      }
    }

    recognition.onerror = async (event) => {
      window.clearTimeout(wakeStartGuardTimerRef.current)
      window.clearTimeout(wakeSilenceTimerRef.current)
      if (event?.error === 'aborted') {
        wakeRecognitionRef.current = null
        if (!isOpenRef.current && !wakeMatchedRef.current) {
          scheduleWakeRestart(WAKE_BLOCKED_RESTART_DELAY_MS)
        }
        return
      }

      console.warn('Wake STT 오류:', event?.error || event)
      wakeRecognitionRef.current = null
      wakeTranscriptRef.current = ''
      wakeMatchedRef.current = false

      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event?.error)) {
        const permissionDenied = await isMicrophonePermissionDenied()
        if (permissionDenied) {
          onWakeListeningChange?.(false)
          setVoiceStatus('마이크 권한을 허용하면 챗봇 켜줘로 시작할 수 있어요.')
          return
        }

        onWakeListeningChange?.(true)
        setVoiceStatus('챗봇 대기 마이크를 다시 여는 중이에요.')
        scheduleWakeRestart(WAKE_BLOCKED_RESTART_DELAY_MS)
        return
      }

      onWakeListeningChange?.(true)
      scheduleWakeRestart()
    }

    recognition.onend = () => {
      window.clearTimeout(wakeStartGuardTimerRef.current)
      window.clearTimeout(wakeSilenceTimerRef.current)
      wakeRecognitionRef.current = null
      if (wakeMatchedRef.current) {
        finishWakeSpeech()
        return
      }
      scheduleWakeRestart()
    }

    recognition.onnomatch = () => {
      wakeTranscriptRef.current = ''
    }

    try {
      onWakeListeningChange?.(true)
      scheduleWakeStartGuard(recognition)
      recognition.start()
    } catch {
      window.clearTimeout(wakeStartGuardTimerRef.current)
      onWakeListeningChange?.(true)
      wakeRecognitionRef.current = null
      scheduleWakeRestart()
    }
  }

  function scheduleWakeRestart(delayMs = WAKE_RESTART_DELAY_MS) {
    window.clearTimeout(wakeRestartTimerRef.current)
    if (isOpenRef.current) {
      return
    }
    setChatbotAudioLock(false)
    wakeRestartTimerRef.current = window.setTimeout(startWakeListening, delayMs)
  }

  function scheduleWakeWatchdog() {
    window.clearTimeout(wakeSilenceTimerRef.current)
    if (isOpenRef.current || !wakeRecognitionRef.current) {
      return
    }

    wakeSilenceTimerRef.current = window.setTimeout(() => {
      if (isOpenRef.current || !wakeRecognitionRef.current) {
        return
      }

      console.warn('Wake STT 입력 이벤트가 없어 대기 마이크를 다시 시작합니다.')
      try {
        wakeRecognitionRef.current?.abort?.()
      } catch {
        // Recognition can already be stopped.
      }
      wakeRecognitionRef.current = null
      wakeTranscriptRef.current = ''
      wakeMatchedRef.current = false
      scheduleWakeRestart(WAKE_BLOCKED_RESTART_DELAY_MS)
    }, WAKE_STUCK_RESTART_MS)
  }

  function scheduleWakeStartGuard(recognition) {
    window.clearTimeout(wakeStartGuardTimerRef.current)
    wakeStartGuardTimerRef.current = window.setTimeout(() => {
      if (isOpenRef.current || wakeRecognitionRef.current !== recognition) {
        return
      }

      console.warn('Wake STT 시작 이벤트가 없어 대기 마이크를 다시 시작합니다.')
      try {
        recognition.abort?.()
      } catch {
        // Recognition can already be stopped.
      }
      wakeRecognitionRef.current = null
      wakeTranscriptRef.current = ''
      wakeMatchedRef.current = false
      onWakeListeningChange?.(true)
      scheduleWakeRestart(WAKE_BLOCKED_RESTART_DELAY_MS)
    }, 2500)
  }

  function stopWakeListening() {
    window.clearTimeout(wakeRestartTimerRef.current)
    window.clearTimeout(wakeSilenceTimerRef.current)
    window.clearTimeout(wakeStartGuardTimerRef.current)
    try {
      wakeRecognitionRef.current?.abort?.()
    } catch {
      // Recognition can already be stopped by the browser.
    }
    wakeRecognitionRef.current = null
    onWakeListeningChange?.(false)
  }

  function finishWakeSpeech() {
    window.clearTimeout(wakeSilenceTimerRef.current)
    if (!wakeMatchedRef.current || isOpenRef.current) {
      return
    }

    wakeMatchedRef.current = false
    try {
      wakeRecognitionRef.current?.abort?.()
    } catch {
      // Recognition can already be stopped by the browser.
    }
    wakeRecognitionRef.current = null
    openChatbot({ fromWake: true })
  }

  function stopRecognition({ abort = true } = {}) {
    clearRecognitionWatchdog()
    const recognition = recognitionRef.current
    recognitionRef.current = null
    recognitionSessionIdRef.current += 1
    try {
      if (abort) {
        recognition?.abort?.()
      } else {
        recognition?.stop?.()
      }
    } catch {
      // Recognition can already be stopped by the browser.
    }
    setIsListening(false)
  }

  async function beginUserListeningTurn() {
    latestTranscriptRef.current = ''
    userSpeechHandledRef.current = false
    setCurrentChatScreen('listening')
    setConversationState(CONVERSATION_STATE.AI_SPEECH_ENDED)
    setVoiceStatus('삐 소리 후 말씀해주세요.')
    setTranscript('')
    await playTurnBeep()
    await delay(POST_CUE_LISTEN_DELAY_MS)
    if (!isOpenRef.current) {
      return
    }
    startVoiceTurn()
  }

  function markRecognitionActivity() {
    clearRecognitionWatchdog()
    if (!isOpenRef.current || userSpeechHandledRef.current || latestTranscriptRef.current) {
      return
    }

    recognitionWatchdogTimerRef.current = window.setTimeout(() => {
      if (!isOpenRef.current || userSpeechHandledRef.current || latestTranscriptRef.current) {
        return
      }

      console.warn('STT 입력 이벤트가 없어 사용자 발화 인식을 다시 시작합니다.')
      setVoiceStatus('마이크 입력을 다시 여는 중...')
      stopRecognition()
      window.setTimeout(() => {
        if (isOpenRef.current && !userSpeechHandledRef.current && !latestTranscriptRef.current) {
          startVoiceTurn()
        }
      }, USER_RESTART_DELAY_MS)
    }, RECOGNITION_STUCK_RESTART_MS)
  }

  function scheduleMicrophoneRetry() {
    window.setTimeout(() => {
      if (isOpenRef.current && !userSpeechHandledRef.current && !latestTranscriptRef.current) {
        startVoiceTurn()
      }
    }, 1800)
  }

  function scheduleUserSpeechEnd(text) {
    clearUserSilenceTimer()
    userSilenceTimerRef.current = window.setTimeout(() => {
      finishUserSpeech(latestTranscriptRef.current || text)
    }, USER_SILENCE_MS)
  }

  function scheduleWaitingUserPrompt() {
    clearWaitingUserTimer()
    waitingUserTimerRef.current = window.setTimeout(() => {
      if (!isOpenRef.current || latestTranscriptRef.current) {
        return
      }

      stopRecognition()

      if (idlePromptGivenRef.current) {
        startVoiceTurn()
        return
      }

      idlePromptGivenRef.current = true
      runAiTurn('필요한 기능을 말씀해주세요.')
    }, WAITING_USER_TIMEOUT_MS)
  }

  function clearConversationTimers() {
    clearUserSilenceTimer()
    clearWaitingUserTimer()
    clearRecognitionWatchdog()
    window.clearTimeout(wakeSilenceTimerRef.current)
  }

  function clearUserSilenceTimer() {
    window.clearTimeout(userSilenceTimerRef.current)
    userSilenceTimerRef.current = null
  }

  function clearWaitingUserTimer() {
    window.clearTimeout(waitingUserTimerRef.current)
    waitingUserTimerRef.current = null
  }

  function clearRecognitionWatchdog() {
    window.clearTimeout(recognitionWatchdogTimerRef.current)
    recognitionWatchdogTimerRef.current = null
  }

  function isActiveRecognition(recognition, sessionId) {
    return recognitionRef.current === recognition && recognitionSessionIdRef.current === sessionId
  }

  return (
    <>
      {!embedded && showFab ? (
        <button className="voice-chatbot-fab" type="button" aria-label="AI 챗봇 열기" onClick={() => openChatbot()}>
          AI
        </button>
      ) : null}

      {embedded || isOpen ? (
        <section
          className={embedded ? 'wearable-chat-screen wearable-chat-screen-embedded' : 'wearable-chat-screen'}
          aria-label="AI 챗봇"
          data-voice-state={conversationState}
        >
          {!(currentChatScreen === 'aiCard' && selectedAiCategory === 'devices') ? (
            <button className="wearable-chat-back" type="button" aria-label="이전으로" onClick={goBack}>
              ‹
            </button>
          ) : null}

          {currentChatScreen === 'start' ? (
            <StartScreen
              onAsk={() => setCurrentChatScreen('ask')}
              onSpeak={() => setCurrentChatScreen('speak')}
              onVoiceStart={startVoiceFromInitialScreen}
            />
          ) : null}

          {currentChatScreen === 'listening' ? <ListeningScreen status={voiceStatus} transcript={transcript} /> : null}
          {currentChatScreen === 'thinking' ? <ThinkingScreen transcript={transcript} /> : null}

          {currentChatScreen === 'speak' ? (
            <PhraseListScreen
              subtitle="원하는 문장을 선택하세요"
              title="대신 말하기"
              onSelect={selectPhrase}
              phrases={[...quickPhrases, ...morePhrases]}
            />
          ) : null}

          {currentChatScreen === 'speaking' ? (
            <SpeakingScreen
              icon={selectedPhraseIcon}
              phrase={selectedPhrase}
              onBack={() => setCurrentChatScreen('speak')}
              onReplay={() => {
                speakText(selectedPhrase)
                requestAppTTS(selectedPhrase)
              }}
            />
          ) : null}

          {currentChatScreen === 'ask' ? <AiCategoryScreen onSelect={selectAiCategory} /> : null}

          {currentChatScreen === 'recommendations' ? (
            <RecommendationScreen categoryId={selectedAiCategory} isRequesting={isRequesting} onSelect={selectRecommendedQuestion} />
          ) : null}

          {currentChatScreen === 'aiCard' ? (
            <WearableAiAnswerCard
              categoryId={selectedAiCategory}
              isRequesting={isRequesting}
              response={chatResponse}
              selectedQuestion={selectedAiQuestion}
              onAppDetail={() => openInApp({ type: 'aiDetail', category: selectedAiCategory })}
              onCloseFollowups={() => setCurrentChatScreen('recommendations')}
              onDeviceQuestion={(question) => requestWearableAiQuestion({
                categoryId: 'devices',
                question,
                query: question?.query || question?.label || '',
              })}
              onFollowup={selectFollowup}
              onReturnToWelfareBaseCard={returnToWelfareBaseCard}
              onRepeatQuestion={() => selectedAiQuestion ? selectRecommendedQuestion(selectedAiQuestion) : undefined}
              onBack={goBack}
            />
          ) : null}

          {currentChatScreen === 'welfareSelect' ? (
            <WelfareSelectScreen
              onMore={() => setCurrentChatScreen('welfareMore')}
              onOpenSearch={() => openWelfareSearchInApp(selectedWelfareType || 'all')}
              onSelect={selectWelfareType}
              welfareTypes={welfareCategories}
            />
          ) : null}

          {currentChatScreen === 'welfareMore' ? (
            <WelfareSelectScreen
              backLabel="이전으로"
              onBack={() => setCurrentChatScreen('welfareSelect')}
              onOpenSearch={() => openWelfareSearchInApp(selectedWelfareType || 'all')}
              onSelect={selectWelfareType}
              title="복지 더보기"
              welfareTypes={moreWelfareCategories}
            />
          ) : null}

          {currentChatScreen === 'answer' ? (
            <AnswerScreen
              answer={selectedAnswer}
              onOpenApp={() => {
                openInApp(selectedAnswer.appPayload)
              }}
              voiceEnabled={!isNotificationAnswer(selectedAnswer) || voiceFeedbackEnabled}
            />
          ) : null}

          {currentChatScreen === 'voiceAnswer' ? (
            <VoiceAnswerScreen
              isRequesting={isRequesting}
              response={chatResponse}
              transcript={transcript}
              onListenAgain={startVoiceTurn}
              onReplay={() => {
                if (!chatResponse?.notificationFeedback || voiceFeedbackEnabled) {
                  speakText(chatResponse?.text || '')
                }
              }}
            />
          ) : null}
        </section>
      ) : null}
    </>
  )
}

function StartScreen({ onAsk, onSpeak, onVoiceStart }) {
  return (
    <div className="wearable-chat-content wearable-chat-start">
      <Header title="AI 챗봇" subtitle="어떤 도움이 필요하신가요?" />
      <div className="wearable-chat-menu">
        <button
          className="wearable-chat-choice wearable-chat-choice-primary"
          type="button"
          aria-label="대신말하기"
          onClick={onSpeak}
        >
          <span className="wearable-chat-choice-icon" aria-hidden="true">
            <SpeakerIcon />
          </span>
          <span>
            <strong>대신말하기</strong>
            <small>내 말을 대신 전해주세요</small>
          </span>
        </button>
        <button
          className="wearable-chat-choice wearable-chat-choice-secondary"
          type="button"
          aria-label="AI에게 묻기"
          onClick={onAsk}
        >
          <span className="wearable-chat-choice-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <span>
            <strong>AI에게 묻기</strong>
            <small>정보를 찾아드려요</small>
          </span>
        </button>
      </div>
      <div className="wearable-chat-wake">
        <button
          className="wearable-chat-mic wearable-chat-wake-button"
          type="button"
          aria-label="챗봇 음성 호출로 시작"
          onClick={onVoiceStart}
        >
          <MicIcon />
        </button>
        <p>‘챗봇 켜줘’라고 말하면 바로 시작해요.</p>
      </div>
    </div>
  )
}

function SpeakerIcon() {
  return (
    <svg className="wearable-chat-svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 10v4h4l5 4V6l-5 4H4Z" />
      <path d="M16 9.5c.8.7 1.3 1.5 1.3 2.5s-.5 1.8-1.3 2.5" />
      <path d="M18.6 7c1.4 1.3 2.3 3 2.3 5s-.9 3.7-2.3 5" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg className="wearable-chat-svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 14c1.7 0 3-1.3 3-3V6c0-1.7-1.3-3-3-3S9 4.3 9 6v5c0 1.7 1.3 3 3 3Z" />
      <path d="M5 10.5c0 3.9 3.1 7 7 7s7-3.1 7-7" />
      <path d="M12 17.5V21" />
      <path d="M8.5 21h7" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="wearable-chat-svg-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13Z" />
      <path d="m15.2 15.2 4.3 4.3" />
    </svg>
  )
}

function ListeningScreen({ status, transcript }) {
  return (
    <div className="wearable-chat-content wearable-chat-speaking">
      <Header title="듣는 중" subtitle={status || '필요한 것을 말씀해주세요'} />
      <div className="wearable-chat-mic wearable-chat-mic-large is-listening" aria-hidden="true">
        🎙
      </div>
      <strong className="wearable-chat-quote">{transcript || '...'}</strong>
    </div>
  )
}

function ThinkingScreen({ transcript }) {
  return (
    <div className="wearable-chat-content wearable-chat-speaking">
      <Header title="AI에게 묻는 중" subtitle={transcript} />
      <div className="wearable-chat-speaker" aria-hidden="true">
        💬
      </div>
      <span className="wearable-chat-footnote">답변을 음성으로 준비하고 있어요.</span>
    </div>
  )
}

function PhraseListScreen({ backLabel = '더보기', onBack, onMore, onSelect, phrases, subtitle, title }) {
  return (
    <div className="wearable-chat-content wearable-chat-list">
      <Header title={title} subtitle={subtitle} />
      <p className="wearable-chat-list-label">자주 쓰는 문장</p>
      <div className="wearable-chat-options" aria-label="자주 쓰는 문장 목록">
        {phrases.map((phrase) => (
          <button
            className="wearable-chat-option"
            key={phrase.id}
            type="button"
            aria-label={`${phrase.text} 말하기`}
            onClick={() => onSelect(phrase)}
          >
            <span aria-hidden="true">{phrase.icon}</span>
            <strong>{phrase.text}</strong>
            <span className="wearable-chat-option-arrow" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
      {onMore ? (
        <button className="wearable-chat-link" type="button" onClick={onMore}>
          {backLabel}에서 더 많은 문장 보기
        </button>
      ) : null}
      {onBack ? (
        <button className="wearable-chat-link" type="button" onClick={onBack}>
          ← {backLabel}
        </button>
      ) : null}
    </div>
  )
}

function SpeakingScreen({ icon, onBack, onReplay, phrase }) {
  return (
    <div className="wearable-chat-content wearable-chat-speaking">
      <Header title="문장을 말하고 있어요" subtitle="상대방이 들을 수 있도록 가까이 있어요." />
      <div className="wearable-chat-speaker" aria-hidden="true">
        {icon}
      </div>
      <div className="wearable-chat-phrase-card" aria-live="polite">
        <span>선택한 문장</span>
        <strong>“{phrase}”</strong>
      </div>
      <button className="wearable-chat-bottom-action" type="button" onClick={onReplay}>
        🔊 한 번 더 말하기
      </button>
      <button className="wearable-chat-link" type="button" onClick={onBack}>
        ← 이전으로
      </button>
    </div>
  )
}

function AiCategoryScreen({ onSelect }) {
  return (
    <div className="wearable-chat-content wearable-ai-category-screen" role="region" aria-labelledby="wearable-ai-category-title">
      <Header title="AI에게 묻기" subtitle="어떤 정보를 알려드릴까요?" titleId="wearable-ai-category-title" />
      <div className="wearable-ai-category-grid" role="list">
        {wearableAiCategories.map((category) => (
          <button
            className="wearable-ai-category-card"
            key={category.id}
            type="button"
            aria-label={category.label}
            onClick={() => onSelect(category.id)}
          >
            <span className="wearable-ai-card-icon" aria-hidden="true">
              {category.icon}
            </span>
            <strong>{category.label}</strong>
          </button>
        ))}
      </div>
    </div>
  )
}

function RecommendationScreen({ categoryId, isRequesting, onSelect }) {
  const category = wearableAiCategories.find((item) => item.id === categoryId) || wearableAiCategories[0]
  const questions = wearableAiQuestions[category.id] || []

  return (
    <div className="wearable-chat-content wearable-ai-recommend-screen" role="region" aria-labelledby="wearable-ai-recommend-title">
      <Header title={category.label} subtitle="추천 질문을 선택하세요" titleId="wearable-ai-recommend-title" />
      <div className="wearable-ai-question-list">
        {questions.map((question) => (
          <button
            className={`wearable-ai-question-button${category.id === 'devices' ? ' wearable-device-question-button' : ''}`}
            key={question.id}
            type="button"
            aria-label={category.label + ' 질문: ' + question.label}
            disabled={isRequesting}
            onClick={() => onSelect(question)}
          >
            <span className="wearable-question-icon" aria-hidden="true">{question.icon || '•'}</span>
            <strong className="wearable-question-text">{question.label}</strong>
            {category.id === 'devices' ? <span className="wearable-question-chevron" aria-hidden="true">›</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

function WearableAiAnswerCard({
  categoryId,
  isRequesting,
  onAppDetail,
  onBack,
  onCloseFollowups,
  onDeviceQuestion,
  onFollowup,
  onReturnToWelfareBaseCard,
  onRepeatQuestion,
  response,
  selectedQuestion,
}) {
  const card = normalizeWearableAiResponse(response, { categoryId })
  const isUrgent = ['URGENT', 'CRITICAL', 'HIGH', 'DANGER', 'EMERGENCY'].includes(card.priority)
  const welfareDetailId = categoryId === 'welfare' && ['apply', 'contact', 'target'].includes(selectedQuestion?.id)
    ? selectedQuestion.id
    : ''
  const cardTitle = welfareDetailId ? selectedQuestion.label : card.title
  const cardSummary = welfareDetailId ? welfareDetailContent(card, welfareDetailId) : card.summary
  const followupQuestions = categoryId === 'welfare'
    ? wearableAiFollowups.filter((followup) => !['apply', 'target', 'contact'].includes(followup.id))
    : wearableAiFollowups

  if (categoryId === 'devices') {
    return (
      <ApplianceStatusAnswerCard
        card={card}
        isRequesting={isRequesting}
        onAppDetail={onAppDetail}
        onBack={onBack}
        onClose={onCloseFollowups}
        onDeviceQuestion={onDeviceQuestion}
        onRepeatQuestion={onRepeatQuestion}
        response={response}
        selectedQuestion={selectedQuestion}
      />
    )
  }

  if (categoryId === 'safety') {
    return (
      <SafetyAlertAnswerCard
        card={card}
        isRequesting={isRequesting}
        onClose={onCloseFollowups}
        selectedQuestion={selectedQuestion}
      />
    )
  }

  if (categoryId === 'guardian') {
    return (
      <GuardianRequestAnswerCard
        isRequesting={isRequesting}
        onClose={onCloseFollowups}
        response={response}
        selectedQuestion={selectedQuestion}
      />
    )
  }

  return (
    <div
      className={`wearable-chat-content wearable-ai-answer-screen ${isUrgent ? 'is-urgent' : ''}`}
      role="region"
      aria-labelledby="wearable-ai-answer-title"
    >
      <Header title="AI 답변" subtitle="핵심만 먼저 확인하세요" titleId="wearable-ai-answer-title" />
      <article className="wearable-ai-answer-card" aria-live="polite">
        <div className="wearable-ai-answer-topline">
          <h2>{cardTitle}</h2>
          {categoryId !== 'welfare' ? (
            <span className="wearable-ai-priority-badge" aria-label={'중요도 ' + card.priority}>
              {card.priority}
            </span>
          ) : null}
        </div>
        <p className="wearable-ai-summary">{cardSummary}</p>
        {!welfareDetailId ? (
          <div className="wearable-ai-action-block">
            <strong>해야 할 일</strong>
            <ul>
              {card.actionItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {categoryId !== 'welfare' ? <p className="wearable-ai-source">출처: {card.source}</p> : null}
        {!welfareDetailId ? (
          <div className={`wearable-ai-card-actions${categoryId === 'welfare' ? ' wearable-welfare-card-actions' : ''}`} aria-label="답변 관련 기능">
            <button type="button" disabled={isRequesting} onClick={() => onFollowup(wearableAiFollowups[0])}>
              신청 방법
            </button>
            <button type="button" disabled={isRequesting} onClick={() => onFollowup(wearableAiFollowups[2])}>
              문의처
            </button>
            {categoryId === 'welfare' ? (
              <button type="button" disabled={isRequesting} onClick={() => onFollowup(wearableAiFollowups[1])}>
                지원 대상
              </button>
            ) : null}
            <button type="button" disabled={isRequesting} onClick={onAppDetail}>
              앱에서 자세히
            </button>
          </div>
        ) : null}
        {welfareDetailId ? (
          <div className="wearable-ai-card-actions wearable-welfare-card-actions wearable-welfare-detail-back">
            <button type="button" disabled={isRequesting} onClick={onReturnToWelfareBaseCard}>
              기본 정보카드로 돌아가기
            </button>
          </div>
        ) : null}
      </article>
      <div className="wearable-ai-followups" aria-label="후속 질문">
        <strong className="wearable-ai-followups-title">더 궁금한 것이 있나요?</strong>
        {followupQuestions.map((followup) => (
          <button
            key={followup.id}
            type="button"
            disabled={isRequesting}
            aria-label={followup.label}
            onClick={() => onFollowup(followup)}
          >
            {followup.label}
          </button>
        ))}
        <button type="button" disabled={isRequesting} aria-label="닫기" onClick={onCloseFollowups}>
          닫기
        </button>
      </div>
    </div>
  )
}

function GuardianRequestAnswerCard({ isRequesting, onClose, response, selectedQuestion }) {
  const contentByQuestion = {
    connect: {
      title: '보호자 연결 요청',
      icon: '📞',
      lines: ['보호자에게 연결 요청을 보냈어요.', '곧 확인할 수 있도록 알림을 전달했어요.'],
    },
    emergency: {
      title: '긴급 도움 요청',
      icon: '🚨',
      lines: ['긴급 도움 요청을 보냈어요.', '보호자에게 즉시 알림을 전달했어요.'],
    },
    guardianAlerts: {
      title: '최근 보호자 알림 확인',
      icon: '👥',
      lines: ['최근 보호자 알림을 확인했어요.'],
    },
  }
  const content = contentByQuestion[selectedQuestion?.id] || contentByQuestion.connect
  const alertPreview = selectedQuestion?.id === 'guardianAlerts' ? guardianAlertPreview(response) : ''

  return (
    <div
      className="wearable-chat-content wearable-ai-answer-screen wearable-guardian-answer-screen"
      role="region"
      aria-labelledby="wearable-guardian-answer-title"
    >
      <Header title="AI 답변" subtitle="요청 결과를 확인하세요." titleId="wearable-guardian-answer-title" />
      <article className="wearable-ai-answer-card wearable-guardian-request-card" aria-live="polite">
        <div className="wearable-guardian-request-heading">
          <span className="wearable-guardian-request-icon" aria-hidden="true">{content.icon}</span>
          <h2>{content.title}</h2>
        </div>
        <div className="wearable-guardian-request-copy">
          {content.lines.map((line) => <p key={line}>{line}</p>)}
          {alertPreview ? <p className="wearable-guardian-alert-preview">{alertPreview}</p> : null}
        </div>
        <div className="wearable-ai-card-actions wearable-guardian-card-actions" aria-label="답변 기능">
          <button type="button" disabled={isRequesting} onClick={onClose}>
            닫기
          </button>
        </div>
      </article>
    </div>
  )
}

function SafetyAlertAnswerCard({ card, isRequesting, onClose, selectedQuestion }) {
  return (
    <div
      className="wearable-chat-content wearable-ai-answer-screen wearable-safety-answer-screen"
      role="region"
      aria-labelledby="wearable-safety-answer-title"
    >
      <Header title="AI 답변" subtitle="알림 내용을 확인하세요." titleId="wearable-safety-answer-title" />
      <article className="wearable-ai-answer-card wearable-safety-alert-card" aria-live="polite">
        <div className="wearable-safety-alert-heading">
          <span className="wearable-safety-alert-label">
            <span aria-hidden="true">{selectedQuestion?.icon || '🛡️'}</span>
            생활/안전
          </span>
          <h2>{selectedQuestion?.label || card.title}</h2>
        </div>
        <div className="wearable-safety-answer-copy">
          <p className="wearable-ai-summary">{card.summary}</p>
        </div>
        <div className="wearable-ai-card-actions wearable-safety-card-actions" aria-label="답변 기능">
          <button type="button" disabled={isRequesting} onClick={onClose}>
            닫기
          </button>
        </div>
      </article>
    </div>
  )
}

function ApplianceStatusAnswerCard({
  card,
  isRequesting,
  onAppDetail,
  onBack,
  onClose,
  onDeviceQuestion,
  onRepeatQuestion,
  response,
  selectedQuestion,
}) {
  const statusCard = createApplianceStatusCard(card, response, selectedQuestion)
  const followupQuestions = wearableAiQuestions.devices
    .filter((question) => !question.direct && question.id !== selectedQuestion?.id)
    .slice(0, 2)
    .map((question) => ({ ...question, displayLabel: applianceDisplayTitle(question, question.label) }))
  const answerScreenRef = useRef(null)

  useEffect(() => {
    answerScreenRef.current?.scrollTo?.({ top: 0 })
  }, [card.summary, card.title])

  return (
    <div
      ref={answerScreenRef}
      className={`wearable-chat-content wearable-ai-answer-screen wearable-appliance-answer-screen status-${statusCard.tone}`}
      role="region"
      aria-labelledby="wearable-appliance-answer-title"
    >
      <div className="wearable-appliance-topline">
        <button className="wearable-appliance-back" type="button" aria-label="이전으로" onClick={onBack}>
          ‹
        </button>
        <span className={`wearable-appliance-status-badge status-${statusCard.tone}`}>
          {statusCard.statusLabel}
        </span>
      </div>

      <article className="wearable-ai-answer-card wearable-appliance-main-card" aria-live="polite">
        <h2 id="wearable-appliance-answer-title" className="wearable-appliance-card-title">
          {selectedQuestion?.label || statusCard.title}
        </h2>
        <span className="wearable-appliance-main-icon" aria-hidden="true">{statusCard.icon}</span>
        <strong>{statusCard.mainText}</strong>
        {statusCard.subText ? <p>{statusCard.subText}</p> : null}
      </article>

      <section className="wearable-ai-answer-card wearable-appliance-quick-card" aria-label="빠른 액션">
        <strong className="wearable-appliance-section-title">빠른 액션</strong>
        <div className="wearable-ai-card-actions">
          {selectedQuestion ? (
            <button type="button" disabled={isRequesting} onClick={onRepeatQuestion}>
              다시 확인
            </button>
          ) : null}
          <button type="button" disabled={isRequesting} onClick={onAppDetail}>
            앱에서 자세히
          </button>
          <button type="button" disabled={isRequesting} onClick={onClose}>
            닫기
          </button>
        </div>
      </section>

      <section className="wearable-ai-answer-card wearable-ai-followups wearable-appliance-followups" aria-label="후속 질문">
        <strong className="wearable-ai-followups-title">후속 질문</strong>
        {followupQuestions.map((question) => (
          <button
            className="wearable-device-followup-button"
            key={question.id}
            type="button"
            disabled={isRequesting}
            onClick={() => onDeviceQuestion(question)}
          >
            <span className="wearable-question-icon" aria-hidden="true">{question.icon}</span>
            <strong className="wearable-question-text">{question.displayLabel}</strong>
          </button>
        ))}
        <button className="wearable-device-followup-button" type="button" disabled={isRequesting} onClick={onClose}>
          <span className="wearable-question-icon" aria-hidden="true">🗂️</span>
          <strong className="wearable-question-text">다른 가전 보기</strong>
        </button>
        <button className="wearable-device-followup-button" type="button" disabled={isRequesting} onClick={onClose}>
          <span className="wearable-question-icon" aria-hidden="true">✕</span>
          <strong className="wearable-question-text">닫기</strong>
        </button>
      </section>
    </div>
  )
}

function WelfareSelectScreen({
  backLabel = '더보기',
  onBack,
  onMore,
  onOpenSearch,
  onSelect,
  title = '복지 정보',
  welfareTypes,
}) {
  return (
    <div className="wearable-chat-content wearable-chat-list">
      <Header title={title} subtitle="어떤 정보가 필요하세요?" />
      <div className="wearable-chat-options">
        {welfareTypes.map((welfareType) => (
          <button
            className="wearable-chat-option"
            key={welfareType.id}
            type="button"
            onClick={() => onSelect(welfareType.id)}
          >
            <span aria-hidden="true">{welfareType.icon}</span>
            <strong>{welfareType.label}</strong>
          </button>
        ))}
      </div>
      {onMore ? (
        <button className="wearable-chat-link" type="button" onClick={onMore}>
          {backLabel}⌄
        </button>
      ) : null}
      {onBack ? (
        <button className="wearable-chat-link" type="button" onClick={onBack}>
          {backLabel}⌃
        </button>
      ) : null}
      <button className="wearable-chat-app-action wearable-chat-search-action" type="button" onClick={onOpenSearch}>
        📱 앱에서 검색
      </button>
    </div>
  )
}

function AnswerScreen({ answer, onOpenApp, voiceEnabled = true }) {
  const hasAlertDetails = answer.detail?.length > 0

  return (
    <div className="wearable-chat-content wearable-chat-answer">
      <Header title={answer.title} />
      <div className="wearable-chat-answer-icon" aria-hidden="true">
        {answer.icon}
      </div>
      <p className="wearable-chat-answer-lines">{formatAnswerTextForDisplay(answer.lines.join('\n'))}</p>
      {hasAlertDetails ? (
        <>
          <div className="wearable-chat-detail-card">
            {answer.detail.map((item) => (
              <div className="wearable-chat-detail-row" key={item.title}>
                <span aria-hidden="true">{item.icon}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
              </div>
            ))}
          </div>
          <p className="wearable-chat-guide">{answer.guide}</p>
        </>
      ) : null}
      <button
        className="wearable-chat-bottom-action"
        type="button"
        onClick={() => {
          const text = answer.lines.join(' ')
          if (voiceEnabled) {
            speakText(text)
            requestAppTTS(text)
          }
        }}
      >
        🔊 다시듣기
      </button>
      <button className="wearable-chat-app-action" type="button" onClick={onOpenApp}>
        📱 앱에서 보기
      </button>
    </div>
  )
}

function VoiceAnswerScreen({ isRequesting, onListenAgain, onReplay, response, transcript }) {
  const isIntro = response?.text === CHATBOT_INTRO

  return (
    <div className="wearable-chat-content wearable-chat-answer">
      <Header title={response?.title || 'AI 답변'} subtitle={transcript ? `질문: ${transcript}` : ''} />
      <div className="wearable-chat-answer-icon" aria-hidden="true">
        💬
      </div>
      {isIntro ? (
        <div className="wearable-chat-intro-message">
          <strong>무엇을 도와드릴까요?</strong>
          <span>현재 알림 · 가전 상태</span>
          <span>위치 안내 · 보호자 연결</span>
          <strong>알림음 뒤에 원하는 기능을 말씀해주세요.</strong>
        </div>
      ) : (
        <p className="wearable-chat-answer-lines">{formatAnswerTextForDisplay(response?.text || '답변을 준비하고 있어요.')}</p>
      )}
      <button className="wearable-chat-bottom-action" type="button" disabled={isRequesting} onClick={onReplay}>
        🔊 다시듣기
      </button>
      <button className="wearable-chat-app-action" type="button" disabled={isRequesting} onClick={onListenAgain}>
        🎙 계속 묻기
      </button>
    </div>
  )
}

function createAnswers({ alert, alertQueue, isPaired, mode, statusMessage, uwbSession }) {
  const unreadAlerts = alertQueue.filter((item) => item?.status !== 'CONFIRMED')
  const dangerAlerts = unreadAlerts.filter((item) => ['DANGER', 'EMERGENCY', 'HIGH', 'CRITICAL'].includes(item.type || item.severity))
  const recentAlert = alert || unreadAlerts[0]
  const currentModeLabel = {
    alert: '알림 확인 중',
    uwb: 'UWB 위치 안내 중',
    deviceSelect: '가전 선택 중',
    idle: '대기 중',
    emergency: '긴급 요청 화면',
    pairing: '연동 대기 중',
  }[mode] || '대기 중'

  return {
    alert: {
      title: '현재 알림',
      icon: '🔔',
      lines: recentAlert
        ? [
            `새 알림이 ${unreadAlerts.length}개 있어요.`,
            dangerAlerts.length ? `위험 알림 ${dangerAlerts.length}개가 있어요.` : '위험 알림은 없어요.',
            `최근 알림은 ${recentAlert.title}입니다.${recentAlert.voiceGuide || recentAlert.message ? `\n${recentAlert.voiceGuide || recentAlert.message}` : ''}`,
          ]
        : ['현재 새 알림은 없어요.', statusMessage || '밴드는 정상 대기 중입니다.'],
      detail: recentAlert
        ? [
            { icon: '📍', title: recentAlert.deviceName || '기기', subtitle: recentAlert.locationName || '위치 정보 없음' },
            { icon: '⚠️', title: recentAlert.title, subtitle: recentAlert.message || '상세 내용 없음' },
          ]
        : [],
      guide: '필요하면 다시듣기라고 말해 알림을 반복할 수 있어요.',
      appPayload: { type: 'alert', filter: 'recent' },
    },
    deviceStatus: {
      title: '가전 상태',
      icon: '🏠',
      lines: isPaired
        ? [
            `현재 밴드는 ${currentModeLabel}입니다.`,
            statusMessage || '연동된 가전과 알림 상태를 확인하고 있어요.',
            uwbSession?.targetDeviceName ? `${uwbSession.targetDeviceName} 위치 안내 정보를 사용할 수 있어요.` : 'UWB 기기를 선택하면 위치 안내를 시작할 수 있어요.',
          ]
        : [
            '현재 밴드는 휴대폰 연동 대기 중입니다.',
            '앱에서 QR을 스캔하면 알림, UWB, 보호자 연결을 음성으로 사용할 수 있어요.',
          ],
      appPayload: { type: 'deviceStatus' },
    },
    guardian: {
      title: '보호자 연결',
      icon: '📞',
      lines: ['보호자에게 연결 요청을', '보낼 수 있어요.', '긴급하면 SOS 또는 긴급 요청을 말해주세요.'],
      appPayload: { type: 'guardianConnect' },
    },
    uwb: {
      title: 'UWB 위치 안내',
      icon: '📍',
      lines: uwbSession?.voiceGuide
        ? [
            `${uwbSession.targetDeviceName || '가전'} 위치 안내 중입니다.`,
            uwbSession.distanceM !== undefined ? `현재 거리 ${uwbSession.distanceM}미터입니다.` : '거리를 확인하고 있어요.',
            uwbSession.voiceGuide,
          ]
        : ['현재 진행 중인 위치 안내는 없어요.', 'UWB 탭에서 가전을 선택하면 음성과 진동으로 안내해드릴게요.'],
      appPayload: { type: 'uwb' },
    },
  }
}

function createWelfareAnswer(welfareType) {
  const fallbackType = welfareType || 'medical'
  const answer = welfareAnswers[fallbackType] || welfareAnswers.medical

  return {
    ...answer,
    appPayload: {
      type: 'welfare',
      category: fallbackType,
      title: answer.title,
    },
  }
}

function Header({ subtitle, title }) {
  return (
    <header className="wearable-chat-header">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  )
}

function speakText(text, options = {}) {
  speechQueue = speechQueue
    .catch(() => {})
    .then(() => speakTextNow(text, options))
  return speechQueue
}

function speakTextNow(text, options = {}) {
  const trimmedText = String(text || '').trim()

  if (!trimmedText || !globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) {
    return Promise.resolve(options.onEnd?.())
  }

  return new Promise((resolve) => {
    clearSpeechTimers()
    const finish = callOnce(async () => {
      clearSpeechTimers()
      setChatbotSpeaking(false)
      try {
        await options.onEnd?.()
      } catch {
        // A follow-up listening turn should not block the speech queue forever.
      }
      resolve()
    })
    const utterance = new SpeechSynthesisUtterance(trimmedText)

    utterance.lang = 'ko-KR'
    utterance.rate = options.rate || 1.04
    utterance.pitch = 1
    utterance.volume = 1
    utterance.voice = findKoreanVoice()
    utterance.onend = finish
    utterance.onerror = (event) => {
      console.warn('TTS 오류:', event?.error || event)
      finish()
    }

    try {
      globalThis.speechSynthesis.resume?.()
      setChatbotSpeaking(true)
      globalThis.speechSynthesis.speak(utterance)
      globalThis.speechSynthesis.resume?.()

      speechKeepAliveTimer = window.setInterval(() => {
        try {
          globalThis.speechSynthesis?.resume?.()
        } catch {
          // Some browsers throw while audio focus is changing.
        }
      }, 250)

      scheduleSpeechFallback(trimmedText, finish)
      scheduleSpeechHardFallback(trimmedText, finish)
    } catch {
      finish()
    }
  })
}

function scheduleSpeechFallback(text, finish) {
  const fallbackMs = Math.max(3500, Math.min(30000, text.length * 260 + 1000))

  speechFallbackTimer = window.setTimeout(() => {
    if (globalThis.speechSynthesis?.speaking || globalThis.speechSynthesis?.pending) {
      try {
        globalThis.speechSynthesis?.resume?.()
      } catch {
        // Speech synthesis can throw while the audio device is changing.
      }
      scheduleSpeechFallback(text, finish)
      return
    }

    finish()
  }, fallbackMs)
}

function scheduleSpeechHardFallback(text, finish) {
  const hardFallbackMs = Math.max(4500, Math.min(26000, text.length * 210 + 1800))

  speechHardFallbackTimer = window.setTimeout(() => {
    try {
      globalThis.speechSynthesis?.cancel?.()
    } catch {
      // Speech synthesis can already be stopped.
    }
    finish()
  }, hardFallbackMs)
}

function clearSpeechTimers() {
  window.clearInterval(speechKeepAliveTimer)
  window.clearTimeout(speechFallbackTimer)
  window.clearTimeout(speechHardFallbackTimer)
  speechKeepAliveTimer = null
  speechFallbackTimer = null
  speechHardFallbackTimer = null
}

function stopChatbotSpeech() {
  clearSpeechTimers()
  setChatbotSpeaking(false)
  setChatbotAudioLock(false)
  speechQueue = Promise.resolve()
  try {
    globalThis.speechSynthesis?.cancel?.()
  } catch {
    // Speech synthesis can already be stopped.
  }
}

function setChatbotSpeaking(isSpeaking) {
  chatbotSpeakingChangeHandler?.(isSpeaking)
}

function setChatbotAudioLock(isLocked) {
  globalThis.__ABLE_BAND_CHATBOT_AUDIO_LOCK__ = isLocked
}

async function playTurnBeep() {
  triggerShortVibration()

  if (await playCueAudioFile()) {
    return
  }

  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext

  if (!AudioContextClass) {
    return delay(TURN_BEEP_DURATION_MS)
  }

  try {
    const audioContext = new AudioContextClass()
    await audioContext.resume?.()

    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const now = audioContext.currentTime
    const durationSec = TURN_BEEP_DURATION_MS / 1000

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(TURN_BEEP_FREQUENCY_HZ, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.28, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + durationSec)

    await delay(TURN_BEEP_DURATION_MS + 40)
    await audioContext.close?.()
  } catch {
    await delay(TURN_BEEP_DURATION_MS)
  }
}

function triggerShortVibration(count = 1) {
  try {
    const sequence = Array.from({ length: count }, () => [80, 80]).flat().slice(0, count * 2 - 1)
    globalThis.navigator?.vibrate?.(sequence)
  } catch {
    // Vibration is optional and not supported on every browser/device.
  }
}

async function playCueAudioFile() {
  try {
    const audio = new Audio(TURN_CUE_AUDIO_SRC)
    audio.preload = 'auto'
    audio.playsInline = true
    audio.volume = 1

    await audio.play()
    await new Promise((resolve) => {
      const done = callOnce(resolve)
      audio.addEventListener('ended', done, { once: true })
      audio.addEventListener('error', done, { once: true })
      window.setTimeout(() => {
        try {
          audio.pause()
          audio.currentTime = 0
        } catch {
          // Audio can already be stopped.
        }
        done()
      }, TURN_CUE_MAX_MS)
    })
    return true
  } catch {
    return false
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function findKoreanVoice() {
  const voices = globalThis.speechSynthesis?.getVoices?.() || []
  return (
    voices.find((voice) => voice.lang?.toLowerCase() === 'ko-kr') ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith('ko')) ||
    null
  )
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

function openInApp(payload) {
  globalThis.location.assign(createAppUrl(payload))
}

function sendPhraseToApp(phrase) {
  console.log('앱으로 대신 말하기 문장 전달:', {
    type: 'speakForMe',
    text: phrase,
  })
}

function requestAppTTS(text) {
  console.log('앱에서 TTS 출력 요청:', text)
}

function createApplianceStatusCard(card, response, selectedQuestion) {
  const sourceCard = response?.appCard || response?.infoCard || response?.card || {}
  const title = applianceDisplayTitle(selectedQuestion, card.title)
  const summaryLines = String(card.summary || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const isFallback = isApplianceFallbackResponse(card, response)
  const fallbackCopy = isFallback ? applianceFallbackCopy(selectedQuestion) : null
  const status = applianceStatusFrom(card.priority, card.summary, sourceCard, isFallback)

  return {
    title,
    icon: selectedQuestion?.icon || applianceIconFor(title, selectedQuestion?.query),
    statusLabel: status.label,
    tone: status.tone,
    mainText: fallbackCopy?.mainText || summaryLines[0] || title,
    subText: fallbackCopy?.subText || summaryLines[1] || '',
    details: applianceDetailRows(sourceCard, response),
  }
}

function applianceDisplayTitle(question, fallbackTitle) {
  const titles = {
    washer: '세탁기 상태',
    fridgeDoor: '냉장고 문 상태',
    airQuality: '공기질 상태',
    deviceLocation: '가전 위치',
    stoveStatus: '전기레인지 상태',
    doorSensor: '도어센서 상태',
    connectedDevices: '연결된 기기 상태',
  }

  return titles[question?.id] || fallbackTitle || question?.label || '가전 상태'
}

function isApplianceFallbackResponse(card, response) {
  const text = [
    card?.summary,
    response?.bandMessage,
    response?.answerText,
    response?.voiceText,
    response?.voiceMessage,
    response?.source,
  ].filter(Boolean).join(' ')

  return response?.source === 'LG Able Band 기본 안내' || /(이해하지 못|찾지 못|확인하지 못|불러오지 못|정보가 없|연결된 기기.*없)/.test(text)
}

function applianceFallbackCopy(question) {
  const fallbackTextByType = {
    washer: '세탁기 상태 정보를 확인하지 못했어요.',
    fridgeDoor: '냉장고 문 상태 정보를 확인하지 못했어요.',
    airQuality: '공기질 상태 정보를 확인하지 못했어요.',
    deviceLocation: '가전 위치 정보를 확인하지 못했어요.',
    stoveStatus: '전기레인지 상태 정보를 확인하지 못했어요.',
    doorSensor: '도어센서 상태 정보를 확인하지 못했어요.',
    connectedDevices: '연결된 기기 상태를 확인하지 못했어요.',
  }

  return {
    mainText: fallbackTextByType[question?.id] || '기기 상태 정보를 확인하지 못했어요.',
    subText: '다시 확인하거나 다른 가전을 선택해 주세요.',
  }
}

function applianceStatusFrom(priority, summary, sourceCard, isFallback) {
  if (isFallback) {
    return { label: '주의', tone: 'warning' }
  }

  const rawStatus = [
    priority,
    sourceCard?.status,
    sourceCard?.statusText,
    sourceCard?.currentStatus,
    sourceCard?.riskLevel,
    summary,
  ].filter(Boolean).join(' ').toLowerCase()

  if (/(urgent|critical|danger|emergency|위험|긴급|화재|가스|즉시|응급)/i.test(rawStatus)) {
    return { label: '위험', tone: 'danger' }
  }

  if (/(high|medium|warning|caution|주의|경고|열림|확인|이상|나쁨)/i.test(rawStatus)) {
    return { label: '주의', tone: 'warning' }
  }

  return { label: '정상', tone: 'normal' }
}

function applianceIconFor(title, query) {
  const text = `${title || ''} ${query || ''}`
  if (/냉장|fridge|refrigerator/i.test(text)) return '❄️'
  if (/공기|co2|air/i.test(text)) return '💨'
  if (/위치|location|uwb/i.test(text)) return '📍'
  if (/도어|문.*센서|door.*sensor/i.test(text)) return '🚪'
  if (/레인지|인덕션|화구|불|range|stove/i.test(text)) return '🔥'
  if (/연결|기기|device|connect/i.test(text)) return '🔗'
  return '🫧'
}

function applianceDetailRows(sourceCard, response) {
  return [
    ['위치', firstPresent(sourceCard?.locationName, sourceCard?.location, sourceCard?.roomName, sourceCard?.room, response?.locationName)],
    ['현재 상태', firstPresent(sourceCard?.currentStatus, sourceCard?.statusText, sourceCard?.status, response?.statusText, response?.status)],
    ['마지막 업데이트', firstPresent(sourceCard?.lastUpdatedText, sourceCard?.lastUpdatedAt, sourceCard?.updatedAt, response?.updatedAt)],
    ['센서값', firstPresent(sourceCard?.sensorValue, sourceCard?.co2, sourceCard?.co2Ppm, sourceCard?.pm25, response?.sensorValue)],
    ['연결 상태', firstPresent(sourceCard?.connectionStatus, sourceCard?.connectionState, response?.connectionStatus)],
  ]
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim())
    .slice(0, 3)
    .map(([label, value]) => ({ label, value: String(value).trim() }))
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim())
}

function guardianAlertPreview(response) {
  const alerts = response?.alerts || response?.appCard?.alerts || response?.infoCard?.alerts || response?.card?.alerts
  const latestAlert = Array.isArray(alerts) ? alerts[0] : null
  const preview = latestAlert?.title || latestAlert?.message

  return preview ? `최근 알림: ${String(preview).trim()}` : ''
}

function normalizeWearableAiResponse(response, meta = {}) {
  const sourceCard = response?.appCard || response?.infoCard || response?.card || {}
  const rawSummary = sourceCard.summary || response?.bandMessage || response?.notificationTabMessage || response?.answerText || response?.voiceText || response?.voiceMessage || '답변을 불러오지 못했어요.'
  const applianceFallback = applianceRecommendationNeedsFallback(meta, rawSummary)
  const fallbackCopy = applianceFallback ? applianceFallbackCopy(meta.question) : null
  const actionItems = normalizeActionItems(sourceCard.actionItems || sourceCard.recommendedActions || sourceCard.recommendedAction)
  const title = sourceCard.title || response?.title || meta.question?.label || wearableAiCategories.find((item) => item.id === meta.categoryId)?.label || 'AI 도움'
  const priority = normalizePriority(response?.priority || sourceCard.priority || response?.classification?.priority)
  const source = applianceFallback
    ? 'LG Able Band 기본 안내'
    : sourceCard.source || sourceCard.sourceName || firstSourceTitle(response?.sourceDocuments) || 'LG Able Band AI'
  const summary = fallbackCopy ? [fallbackCopy.mainText, fallbackCopy.subText].join('\n') : rawSummary
  return { ...response, title, priority, summary: clampLines(summary, 3), actionItems: (actionItems.length ? actionItems : ['앱에서 자세한 내용을 확인하세요.']).slice(0, 2), source, voiceMessage: fallbackCopy ? summary : response?.voiceMessage || response?.voiceText || rawSummary, context: { ...(meta.context || {}), lastInfoAgent: { title, query: meta.query || '' }, lastInfoCard: { ...sourceCard, title }, selectedDocument: response?.selectedDocument || response?.sourceDocuments?.[0] || meta.context?.selectedDocument } }
}

function welfareDetailContent(card, detailId) {
  const sourceCard = card?.appCard || card?.infoCard || card?.card || {}
  const valueByDetail = {
    apply: firstPresent(sourceCard.applicationMethod, sourceCard.applyMethod, card?.applicationMethod, card?.applyMethod),
    contact: firstPresent(sourceCard.contact, sourceCard.contactInfo, card?.contact, card?.contactInfo),
    target: firstPresent(sourceCard.supportTarget, sourceCard.eligibility, sourceCard.applicationTarget, card?.supportTarget, card?.eligibility, card?.applicationTarget),
  }

  return valueByDetail[detailId] || card.summary
}

function applianceRecommendationNeedsFallback(meta, text) {
  if (meta.categoryId !== 'devices' || !applianceTypeForQuestion(meta.question)) {
    return false
  }

  return /(어떤 상태를 확인할지.*구체적으로|어떤 기기 상태인지|더 자세히 질문)/.test(String(text || ''))
}

function applianceTypeForQuestion(question) {
  return {
    washer: 'washer',
    fridgeDoor: 'refrigeratorDoor',
    airQuality: 'airQuality',
    deviceLocation: 'applianceLocation',
    stoveStatus: 'electricRange',
    doorSensor: 'doorSensor',
    connectedDevices: 'connectedDevices',
  }[question?.id] || ''
}
function createWearableAiLoadingResponse(question, query) {
  return {
    title: question?.label || 'AI 도움',
    priority: 'NORMAL',
    summary: '답변을 준비하고 있어요.',
    actionItems: ['잠시만 기다려 주세요.'],
    source: 'LG Able Band AI',
    voiceMessage: '',
    context: {
      lastInfoAgent: {
        title: question?.label || 'AI 도움',
        query,
      },
    },
  }
}
function createWearableAiFallbackResponse(meta = {}) {
  const category = wearableAiCategories.find((item) => item.id === meta.categoryId)
  const title = meta.question?.label || category?.label || 'AI 도움'
  const summaryByCategory = {
    welfare: '복지 정보는 대상, 신청 방법, 문의처를 차례로 확인하면 좋아요. 자세한 조건은 앱에서 확인할 수 있어요.',
    safety: '위험 상황은 먼저 안전한 곳으로 이동하고, 필요한 경우 보호자에게 도움 요청을 보내세요.',
    devices: '가전 상태는 연결 여부와 최근 알림을 먼저 확인하세요. 위치 안내가 필요하면 기기 찾기를 시작할 수 있어요.',
    guardian: '보호자 연결이나 긴급 도움 요청이 필요하면 앱과 밴드에서 즉시 요청할 수 있어요.',
  }
  const summary = summaryByCategory[meta.categoryId] || '지금은 AI 서버 응답이 늦어 기본 안내를 보여드려요.'

  return {
    title,
    priority: 'NORMAL',
    summary,
    actionItems: ['앱에서 자세한 내용을 확인하세요.', '필요하면 다시 질문해 주세요.'],
    source: 'LG Able Band 기본 안내',
    voiceMessage: summary,
    context: {
      ...(meta.context || {}),
      lastInfoAgent: {
        title,
        query: meta.query || '',
      },
    },
  }
}
function normalizeActionItems(value) { if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean); if (typeof value === 'string' && value.trim()) return value.split(/\n|\.|,/).map((item) => item.trim()).filter(Boolean); return [] }
function normalizePriority(value) { const priority = String(value || 'NORMAL').trim().toUpperCase(); return ['URGENT', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NORMAL', 'DANGER', 'EMERGENCY'].includes(priority) ? priority : 'NORMAL' }
function firstSourceTitle(sourceDocuments) { const firstSource = Array.isArray(sourceDocuments) ? sourceDocuments[0] : null; return firstSource?.source || firstSource?.title || firstSource?.url || '' }
function clampLines(text, maxLines = 3) { const sentences = String(text || '').replace(/\s+/g, ' ').split(/(?<=[.!?。！？])\s+|\n+/).map((item) => item.trim()).filter(Boolean); const selected = (sentences.length ? sentences : [String(text || '').trim()]).slice(0, maxLines); return selected.join('\n') || '답변이 비어 있어요. 앱에서 자세한 내용을 확인하세요.' }

function formatAnswerTextForDisplay(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/([^\d\s])\.\s*/g, '$1.\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function openWelfareSearchInApp(category) {
  const payload = {
    type: 'welfareSearch',
    category,
  }

  globalThis.location.assign(createAppUrl(payload))
}

function normalizeSpeechText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, '')
}

function normalizeWakeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s.,!?~'"`]/g, '')
}

function isMeaningfulTranscript(text) {
  return normalizeSpeechText(text).length >= MIN_USER_TRANSCRIPT_CHARS
}

function cleanupRecognizedSpeech(text) {
  const trimmedText = String(text || '').replace(/\s+/g, ' ').trim()
  if (!trimmedText) {
    return ''
  }

  const compactText = trimmedText.replace(/\s/g, '')
  for (let size = 2; size <= Math.floor(compactText.length / 2); size += 1) {
    if (compactText.length % size === 0) {
      const unit = compactText.slice(0, size)
      const repeated = unit.repeat(compactText.length / size)
      if (repeated === compactText) {
        return unit
      }
    }
  }

  const words = trimmedText.split(' ')
  const dedupedWords = []
  for (const word of words) {
    if (word && word !== dedupedWords[dedupedWords.length - 1]) {
      dedupedWords.push(word)
    }
  }

  return dedupedWords.join(' ')
}

function getRecognitionAlternatives(result) {
  if (!result?.length) {
    return []
  }

  return Array.from({ length: result.length }, (_, index) => result[index]?.transcript || '').filter(Boolean)
}

function getSpeechRecognitionConstructor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition
}

async function checkMicrophoneAvailability() {
  if (!isMicrophoneSecureContext()) {
    return '마이크는 localhost 또는 HTTPS 주소에서만 사용할 수 있어요.'
  }

  try {
    const permissionStatus = await globalThis.navigator?.permissions?.query?.({ name: 'microphone' })
    if (permissionStatus?.state === 'denied') {
      return '마이크 권한을 허용해주세요.'
    }
  } catch {
    // Some mobile browsers do not expose microphone permissions here.
  }

  if (!globalThis.navigator?.mediaDevices?.getUserMedia && !getSpeechRecognitionConstructor()) {
    return '이 브라우저에서 마이크 인식을 사용할 수 없어요.'
  }

  return ''
}

async function isMicrophonePermissionDenied() {
  try {
    const permissionStatus = await globalThis.navigator?.permissions?.query?.({ name: 'microphone' })
    return permissionStatus?.state === 'denied'
  } catch {
    return false
  }
}

function isMicrophoneSecureContext() {
  const location = globalThis.location
  const hostname = location?.hostname || ''
  return (
    globalThis.isSecureContext ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  )
}

function shouldOpenChatbot(text) {
  const normalizedText = normalizeSpeechText(text)
  const compactText = normalizeWakeText(text)
  if (WAKE_WORDS.some((word) => compactText.includes(normalizeWakeText(word)))) {
    return true
  }

  if (hasWakeSubject(compactText) && hasWakeAction(compactText)) {
    return true
  }

  return (
    /(챗|쳇|채|첵|책|체크|챡|착|챠|차|챕|찻|채팅|챗지피티|지피티|gpt).{0,8}(봇|본|봄|벗|봇트|보|복|포|bot|보트|지피티)?.{0,10}(켜|커|크|켜줘|켜죠|켜주|켜저|켜져|켜주세요|열|열어|열어줘|열어주세요|시작|시작해|실행|불러|호출)/i.test(normalizedText) ||
    /(챗|쳇|채|첵|책|체크|챡|착|챠|차|챕|찻|챗지피티|지피티).{0,10}(켜|커|크|켜줘|켜죠|켜주|켜저|켜져|켜주세요|열|열어|열어줘|열어주세요|시작|시작해|실행|불러|호출)/i.test(normalizedText) ||
    /(에이아이|에이|ai|able|에이블).{0,12}(챗|쳇|채|봇|모드|켜|커|크|열|시작|시작해|실행|불러|호출)/i.test(normalizedText) ||
    /(cat|chat|check|cheat|chet|chap|gpt|bot).{0,12}(on|open|start|run)/i.test(compactText) ||
    /chatbot(open|on|start)/i.test(compactText)
  )
}

function hasWakeSubject(text) {
  return /(챗|쳇|채|첵|책|체크|챡|착|챠|차|챕|찻|채팅|챗지피티|지피티|gpt).{0,8}(봇|본|봄|벗|봇트|보|복|포|bot|보트)?/i.test(text) ||
    /(에이아이|에이아이모드|에이|ai|able|에이블)/i.test(text)
}

function hasWakeAction(text) {
  return /(켜|커|크|켜줘|켜죠|켜주|켜저|켜져|켜주세요|열|열어|열어줘|열어주세요|시작|시작해|실행|불러|호출|도와)/i.test(text)
}

function classifyVoiceIntent(text) {
  const normalizedText = normalizeSpeechText(text)

  if (shouldOpenChatbot(text)) {
    return VOICE_INTENT.OPEN_CHATBOT
  }

  if (CLOSE_WORDS.some((word) => normalizedText.includes(word))) {
    return VOICE_INTENT.GO_IDLE
  }

  if (includesAny(normalizedText, ['처음으로돌아가', '처음으로', '처음부터', '처음'])) {
    return VOICE_INTENT.GO_START
  }

  if (includesAny(normalizedText, ['그만', '안내중단', '중단해'])) {
    return VOICE_INTENT.CANCEL
  }

  if (includesAny(normalizedText, ['탐색종료', '탐색그만', '위치안내종료', '위치안내그만', '안내종료'])) {
    return VOICE_INTENT.STOP_UWB
  }

  if (includesAny(normalizedText, ['다시들려줘', '다시말해줘', '한번더', '반복', '재생'])) {
    return VOICE_INTENT.REPEAT
  }

  if (includesAny(normalizedText, ['확인했어', '확인완료', '확인했어요', '봤어', '알겠어', '알겠어요'])) {
    return VOICE_INTENT.CONFIRM_DONE
  }

  if (includesAny(normalizedText, ['현재알림', '현재알람', '긴급알림', '긴급알람', '알림알려', '알람알려', '알림읽어', '알람읽어', '알림확인', '알람확인', '알림', '알람', 'alert'])) {
    return VOICE_INTENT.READ_ALERTS
  }

  if (includesAny(normalizedText, ['긴급', '도움요청', '살려줘', '도와줘', '도와주세요', 'sos', '에스오에스'])) {
    return VOICE_INTENT.EMERGENCY_REQUEST
  }

  if (includesAny(normalizedText, ['대신말하기', '대신말해', '전하고싶은말', '말전달'])) {
    return VOICE_INTENT.SUBSTITUTE_SPEECH
  }

  if (includesAny(normalizedText, ['보호자에게전달', '보호자에게보내', '보호자한테전달', '보호자한테보내'])) {
    return VOICE_INTENT.SHARE_TO_GUARDIAN
  }

  if (includesAny(normalizedText, ['보조기기', '보장구', '기기지원'])) {
    return VOICE_INTENT.WELFARE_ASSISTIVE_DEVICE
  }

  if (includesAny(normalizedText, ['복지정보', '복지', '활동지원', '긴급돌봄', '보호자연계'])) {
    return VOICE_INTENT.WELFARE_INFO
  }

  if (includesAny(normalizedText, ['보호자', '보호자연결', '보호자에게', '연락', '전화'])) {
    return VOICE_INTENT.GUARDIAN_CONNECT
  }

  if (hasApplianceStatusRequest(normalizedText)) {
    return VOICE_INTENT.READ_APPLIANCE_STATUS
  }

  if (includesAny(normalizedText, ['세탁기', '세탁', '빨래']) && includesAny(normalizedText, ['찾', '위치', '어디', '안내'])) {
    return VOICE_INTENT.FIND_WASHER
  }

  if (includesAny(normalizedText, ['냉장고', '냉장', '냉동고']) && includesAny(normalizedText, ['찾', '위치', '어디', '안내'])) {
    return VOICE_INTENT.FIND_FRIDGE
  }

  if (includesAny(normalizedText, ['가전상태', '가전', '기기상태', '상태알려', '상태읽어', '상태확인', '연결상태'])) {
    return VOICE_INTENT.READ_APPLIANCE_STATUS
  }

  if (includesAny(normalizedText, ['아니', '아니야', '취소', '하지마', '보내지마', '중지'])) {
    return VOICE_INTENT.NO
  }

  if (includesAny(normalizedText, ['네', '응', '그래', '좋아', '보내줘', '연결해', '해줘'])) {
    return VOICE_INTENT.YES
  }

  return VOICE_INTENT.UNKNOWN
}

function createIntentVoiceResponse(intent) {
  const responses = {
    [VOICE_INTENT.OPEN_CHATBOT]: 'AI 챗봇이 이미 실행 중이에요. 원하시는 기능을 말씀해주세요.',
    [VOICE_INTENT.READ_ALERTS]: '현재 알림을 확인할게요.',
    [VOICE_INTENT.READ_APPLIANCE_STATUS]: '가전 상태를 확인할게요.',
    [VOICE_INTENT.FIND_WASHER]: '세탁기 위치 안내를 시작할게요.',
    [VOICE_INTENT.FIND_FRIDGE]: '냉장고 위치 안내를 시작할게요.',
    [VOICE_INTENT.GUARDIAN_CONNECT]: '보호자에게 도움 요청을 보낼까요?',
    [VOICE_INTENT.EMERGENCY_REQUEST]: '긴급 도움 요청을 보낼까요?',
    [VOICE_INTENT.SUBSTITUTE_SPEECH]: '전하고 싶은 말을 말씀해주세요.',
    [VOICE_INTENT.WELFARE_INFO]: '복지 정보를 안내할게요.',
    [VOICE_INTENT.WELFARE_ASSISTIVE_DEVICE]: '보조기기 지원 정보를 안내할게요.',
    [VOICE_INTENT.SHARE_TO_GUARDIAN]: '보호자에게 정보를 전달할게요.',
    [VOICE_INTENT.REPEAT]: '방금 안내를 다시 들려드릴게요.',
    [VOICE_INTENT.CONFIRM_DONE]: '확인 완료로 처리할게요.',
    [VOICE_INTENT.YES]: '네. 요청을 진행할게요.',
    [VOICE_INTENT.NO]: '알겠어요. 요청을 취소할게요.',
    [VOICE_INTENT.STOP_UWB]: '위치 안내를 종료할게요.',
    [VOICE_INTENT.CANCEL]: '안내를 중단했어요.',
    [VOICE_INTENT.GO_START]: '처음으로 돌아갈게요. 필요한 기능을 말씀해주세요.',
    [VOICE_INTENT.GO_IDLE]: 'AI 챗봇을 종료하고 대기 상태로 돌아갈게요.',
    [VOICE_INTENT.UNKNOWN]: '죄송해요. 다시 한 번 말씀해주세요.',
  }

  return responses[intent] || responses[VOICE_INTENT.UNKNOWN]
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

function hasApplianceStatusRequest(text) {
  return Boolean(
    getRequestedApplianceName(text) &&
      includesAny(text, ['상태', '확인', '알려', '읽어', '연결', '작동', '동작', '켜져', '꺼져']),
  )
}

function getRequestedApplianceName(text) {
  const normalizedText = normalizeSpeechText(text)
  if (includesAny(normalizedText, ['세탁기', '세탁', '빨래'])) {
    return '세탁기'
  }
  if (includesAny(normalizedText, ['냉장고', '냉장', '냉동고'])) {
    return '냉장고'
  }
  return ''
}

function formatApplianceStatus(appliance) {
  const status = String(appliance?.connectionStatus || appliance?.status || '').toUpperCase()
  if (['CONNECTED', 'ONLINE', 'ACTIVE', 'OK'].includes(status)) {
    return '연결되어 있어요'
  }
  if (['DISCONNECTED', 'OFFLINE', 'INACTIVE'].includes(status)) {
    return '연결이 끊겨 있어요'
  }
  if (['WARNING', 'CAUTION', 'CHECK'].includes(status)) {
    return '확인이 필요해요'
  }
  return appliance?.connectionStatus || appliance?.status || '상태 정보를 확인 중이에요'
}

function getUnreadAlerts(alerts) {
  return (alerts || []).filter((item) => item && item.status !== 'CONFIRMED')
}

function isUrgentAlert(alert) {
  return ['DANGER', 'EMERGENCY', 'HIGH', 'CRITICAL'].includes(alert?.type) || ['HIGH', 'CRITICAL'].includes(alert?.severity)
}

function formatAlertSpeech(alert, { includeTime = false } = {}) {
  const title = alert?.title || '알림'
  const guide = alert?.voiceGuide || alert?.message || '상세 내용이 없습니다.'
  const timeText = includeTime && alert?.occurredAt ? ` 발생 시간은 ${formatKoreanTime(alert.occurredAt)}입니다.` : ''

  if (isUrgentAlert(alert)) {
    return `${title} 알림입니다. ${guide}${timeText}`
  }

  return `${title}입니다. ${guide}${timeText}`
}

function formatKoreanTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '시간 정보 없음'
  }

  return date.toLocaleTimeString('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getConnectedApplianceNames(alerts, uwbSession) {
  const names = new Set(['세탁기', '냉장고'])

  ;(alerts || []).forEach((item) => {
    if (item?.deviceName && !['도어센서', '안전 전기레인지'].includes(item.deviceName)) {
      names.add(item.deviceName)
    }
  })

  if (uwbSession?.targetDeviceName) {
    names.add(uwbSession.targetDeviceName)
  }

  return Array.from(names).slice(0, 4)
}

function joinKoreanList(items) {
  if (!items.length) {
    return '연결된 가전 없음'
  }

  if (items.length === 1) {
    return items[0]
  }

  return `${items.slice(0, -1).join(', ')}와 ${items[items.length - 1]}`
}

function createUwbDistanceGuide(session) {
  const distance = Number(session?.distanceMeter ?? session?.distanceM)
  if (!Number.isFinite(distance)) {
    return null
  }

  if (distance < 0.5) {
    return {
      zone: 'ARRIVED',
      vibrationPattern: 'STRONG',
      message: '목적지에 도착했어요.',
    }
  }

  if (distance < 1) {
    return {
      zone: 'VERY_CLOSE',
      vibrationPattern: 'FAST',
      message: '거의 도착했어요.',
    }
  }

  if (distance < 3) {
    return {
      zone: 'CLOSER',
      vibrationPattern: 'MEDIUM',
      message: '가까워지고 있어요.',
    }
  }

  return {
    zone: 'FAR',
    vibrationPattern: 'SLOW',
    message: '아직 거리가 있어요. 천천히 이동해주세요.',
  }
}

function createAppUrl(payload) {
  const appUrl = new URL(getPhoneAppBaseUrl())

  appUrl.searchParams.set('from', 'wearable')
  appUrl.searchParams.set('type', payload?.type || 'home')

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      appUrl.searchParams.set(key, String(value))
    }
  })

  return appUrl.toString()
}

function getPhoneAppBaseUrl() {
  const configuredUrl =
    globalThis.__ABLE_BAND_APP_URL__ || import.meta.env.VITE_PHONE_APP_URL || import.meta.env.VITE_APP_URL

  if (configuredUrl) {
    return configuredUrl
  }

  const currentUrl = new URL(globalThis.location.href)

  if (currentUrl.port === '5174') {
    currentUrl.port = '5173'
  }

  currentUrl.pathname = '/'
  currentUrl.search = ''
  currentUrl.hash = ''

  return currentUrl.toString()
}
