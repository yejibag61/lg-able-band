import { useState } from 'react'

const SpeechRecognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition

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

const quickQuestions = [
  { id: 'alert', icon: '🔔', label: '현재 알림' },
  { id: 'deviceStatus', icon: '🏠', label: '가전 상태' },
  { id: 'welfare', icon: '🧾', label: '복지 정보' },
  { id: 'guardian', icon: '📞', label: '보호자 연결' },
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

const answers = {
  alert: {
    title: '현재 알림',
    icon: '🔔',
    lines: ['새 알림이 2개 있어요.', '위험 알림 1개', '생활 알림 1개'],
    appPayload: { type: 'alert', filter: 'recent' },
  },
  deviceStatus: {
    title: '가전 상태',
    icon: '🏠',
    lines: ['냉장고 정상', '세탁기 정상', '에어컨 작동 중'],
    appPayload: { type: 'deviceStatus' },
  },
  guardian: {
    title: '보호자 연결',
    icon: '📞',
    lines: ['보호자에게 연결 요청을', '보낼 수 있어요.', '긴급하면 SOS를 이용해주세요.'],
    appPayload: { type: 'guardianConnect' },
  },
}

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

export function VoiceChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentChatScreen, setCurrentChatScreen] = useState('start')
  const [selectedPhrase, setSelectedPhrase] = useState('')
  const [selectedQuestion, setSelectedQuestion] = useState('alert')
  const [selectedWelfareType, setSelectedWelfareType] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const selectedAnswer =
    selectedQuestion === 'welfare'
      ? createWelfareAnswer(selectedWelfareType)
      : answers[selectedQuestion] || answers.alert

  function openChatbot() {
    setIsOpen(true)
    setCurrentChatScreen('start')
    setSelectedPhrase('')
    setSelectedQuestion('alert')
    setSelectedWelfareType('')
    setVoiceStatus('')
  }

  function closeChatbot() {
    setIsOpen(false)
  }

  function selectPhrase(phrase) {
    setSelectedPhrase(phrase)
    setCurrentChatScreen('speaking')
    sendPhraseToApp(phrase)
    speakText(phrase)
    requestAppTTS(phrase)
  }

  function selectQuestion(questionId) {
    if (questionId === 'welfare') {
      setSelectedQuestion('welfare')
      setCurrentChatScreen('welfareSelect')
      return
    }

    setSelectedQuestion(questionId)
    setSelectedWelfareType('')
    setCurrentChatScreen('answer')
    speakText((answers[questionId] || answers.alert).lines.join(' '))
  }

  function selectWelfareType(welfareType) {
    setSelectedQuestion('welfare')
    setSelectedWelfareType(welfareType)
    setCurrentChatScreen('answer')
    speakText(createWelfareAnswer(welfareType).lines.join(' '))
  }

  function handleVoiceQuestion() {
    if (!SpeechRecognition) {
      setVoiceStatus('이 브라우저는 마이크 인식을 지원하지 않아요.')
      speakText('마이크 인식을 지원하지 않아요.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.interimResults = false
    recognition.continuous = false

    recognition.onstart = () => {
      setVoiceStatus('듣는 중...')
    }

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')
        .trim()

      setVoiceStatus(transcript ? `인식: ${transcript}` : '잘 못 들었어요.')
      routeVoiceQuestion(transcript)
    }

    recognition.onerror = () => {
      setVoiceStatus('마이크 권한을 확인해주세요.')
      speakText('마이크 권한을 확인해주세요.')
    }

    recognition.onend = () => {
      setVoiceStatus((current) => (current === '듣는 중...' ? '잘 못 들었어요.' : current))
    }

    try {
      recognition.start()
    } catch {
      setVoiceStatus('잠시 후 다시 눌러주세요.')
    }
  }

  function routeVoiceQuestion(text) {
    const normalizedText = normalizeSpeechText(text)

    if (!normalizedText) {
      speakText('잘 못 들었어요. 다시 말씀해주세요.')
      return
    }

    if (normalizedText.includes('복지') || normalizedText.includes('지원')) {
      setSelectedQuestion('welfare')
      setCurrentChatScreen('welfareSelect')
      speakText('어떤 복지 정보가 필요하세요?')
      return
    }

    if (normalizedText.includes('가전') || normalizedText.includes('기기') || normalizedText.includes('상태')) {
      selectQuestion('deviceStatus')
      return
    }

    if (normalizedText.includes('보호자') || normalizedText.includes('연결')) {
      selectQuestion('guardian')
      return
    }

    if (normalizedText.includes('알림') || normalizedText.includes('위험')) {
      selectQuestion('alert')
      return
    }

    setCurrentChatScreen('ask')
    speakText('원하는 질문을 선택해주세요.')
  }

  function goBack() {
    if (currentChatScreen === 'start') {
      closeChatbot()
      return
    }

    const previousScreen = {
      speak: 'start',
      speakMore: 'speak',
      speaking: 'speak',
      ask: 'start',
      welfareSelect: 'ask',
      welfareMore: 'welfareSelect',
      answer: 'ask',
    }[currentChatScreen]

    setCurrentChatScreen(
      currentChatScreen === 'answer' && selectedQuestion === 'welfare'
        ? 'welfareSelect'
        : previousScreen || 'start',
    )
  }

  return (
    <>
      <button className="voice-chatbot-fab" type="button" aria-label="AI 챗봇 열기" onClick={openChatbot}>
        AI
      </button>

      {isOpen ? (
        <section className="wearable-chat-screen" aria-label="AI 챗봇">
          <button className="wearable-chat-back" type="button" aria-label="이전으로" onClick={goBack}>
            ‹
          </button>

          {currentChatScreen === 'start' ? (
            <StartScreen
              onAsk={() => setCurrentChatScreen('ask')}
              onSpeak={() => setCurrentChatScreen('speak')}
              onVoiceQuestion={handleVoiceQuestion}
              voiceStatus={voiceStatus}
            />
          ) : null}

          {currentChatScreen === 'speak' ? (
            <PhraseListScreen
              subtitle="원하는 문장을 선택하세요"
              title="대신 말하기"
              onMore={() => setCurrentChatScreen('speakMore')}
              onSelect={selectPhrase}
              phrases={quickPhrases}
            />
          ) : null}

          {currentChatScreen === 'speakMore' ? (
            <PhraseListScreen
              title="더 많은 문장"
              backLabel="이전으로"
              onBack={() => setCurrentChatScreen('speak')}
              onSelect={selectPhrase}
              phrases={morePhrases}
            />
          ) : null}

          {currentChatScreen === 'speaking' ? (
            <SpeakingScreen
              phrase={selectedPhrase}
              onBack={() => setCurrentChatScreen('speak')}
              onReplay={() => {
                speakText(selectedPhrase)
                requestAppTTS(selectedPhrase)
              }}
            />
          ) : null}

          {currentChatScreen === 'ask' ? (
            <AskScreen onSelect={selectQuestion} />
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
            />
          ) : null}
        </section>
      ) : null}
    </>
  )
}

function StartScreen({ onAsk, onSpeak, onVoiceQuestion, voiceStatus }) {
  return (
    <div className="wearable-chat-content wearable-chat-start">
      <Header title="AI 챗봇" subtitle="무엇을 도와드릴까요?" />
      <div className="wearable-chat-menu">
        <button className="wearable-chat-choice wearable-chat-choice-primary" type="button" onClick={onSpeak}>
          <span className="wearable-chat-choice-icon" aria-hidden="true">
            🗣️
          </span>
          <span>
            <strong>대신 말하기</strong>
            <small>내 말을 대신 전해주세요</small>
          </span>
        </button>
        <button className="wearable-chat-choice wearable-chat-choice-secondary" type="button" onClick={onAsk}>
          <span className="wearable-chat-choice-icon" aria-hidden="true">
            💬
          </span>
          <span>
            <strong>AI에게 묻기</strong>
            <small>정보를 찾아드려요</small>
          </span>
        </button>
      </div>
      <button className="wearable-chat-mic" type="button" aria-label="말로 질문하기" onClick={onVoiceQuestion}>
        🎙
      </button>
      <span className="wearable-chat-footnote">{voiceStatus || '말로 질문하기'}</span>
    </div>
  )
}

function PhraseListScreen({ backLabel = '더보기', onBack, onMore, onSelect, phrases, subtitle, title }) {
  return (
    <div className="wearable-chat-content wearable-chat-list">
      <Header title={title} subtitle={subtitle} />
      <div className="wearable-chat-options">
        {phrases.map((phrase) => (
          <button className="wearable-chat-option" key={phrase.id} type="button" onClick={() => onSelect(phrase.text)}>
            <span aria-hidden="true">{phrase.icon}</span>
            <strong>{phrase.text}</strong>
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
    </div>
  )
}

function SpeakingScreen({ onBack, onReplay, phrase }) {
  return (
    <div className="wearable-chat-content wearable-chat-speaking">
      <Header title="음성 출력 중" />
      <div className="wearable-chat-speaker" aria-hidden="true">
        🔊
      </div>
      <strong className="wearable-chat-quote">“{phrase}”</strong>
      <button className="wearable-chat-bottom-action" type="button" onClick={onReplay}>
        🔊 다시 말하기
      </button>
      <button className="wearable-chat-link" type="button" onClick={onBack}>
        ← 이전으로
      </button>
    </div>
  )
}

function AskScreen({ onSelect }) {
  return (
    <div className="wearable-chat-content wearable-chat-list">
      <Header title="AI에게 묻기" subtitle="무엇을 궁금하세요?" />
      <div className="wearable-chat-options">
        {quickQuestions.map((question) => (
          <button className="wearable-chat-option" key={question.id} type="button" onClick={() => onSelect(question.id)}>
            <span aria-hidden="true">{question.icon}</span>
            <strong>{question.label}</strong>
          </button>
        ))}
      </div>
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

function AnswerScreen({ answer, onOpenApp }) {
  const hasAlertDetails = answer.detail?.length > 0

  return (
    <div className="wearable-chat-content wearable-chat-answer">
      <Header title={answer.title} />
      {!hasAlertDetails ? (
        <>
          <div className="wearable-chat-answer-icon" aria-hidden="true">
            {answer.icon}
          </div>
          <p className="wearable-chat-answer-lines">{answer.lines.join('\n')}</p>
        </>
      ) : null}
      {hasAlertDetails ? (
        <>
          <div className="wearable-chat-answer-icon" aria-hidden="true">
            {answer.icon}
          </div>
          <p className="wearable-chat-answer-lines">{answer.lines.join('\n')}</p>
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
          speakText(text)
          requestAppTTS(text)
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

function speakText(text) {
  console.log('TTS 출력:', text)

  const trimmedText = text.trim()

  if (!trimmedText || !globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) {
    return
  }

  const utterance = new SpeechSynthesisUtterance(trimmedText)

  utterance.lang = 'ko-KR'
  utterance.rate = 0.92
  utterance.pitch = 1
  utterance.volume = 1

  globalThis.speechSynthesis.cancel()
  globalThis.speechSynthesis.speak(utterance)
}

function openInApp(payload) {
  console.log('앱에서 보기:', payload)
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

function openWelfareSearchInApp(category) {
  const payload = {
    type: 'welfareSearch',
    category,
  }

  console.log('앱 복지 정보 화면 열기:', payload)
  globalThis.location.assign(createAppUrl(payload))
}

function normalizeSpeechText(text) {
  return text.toLowerCase().replace(/\s+/g, '')
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
