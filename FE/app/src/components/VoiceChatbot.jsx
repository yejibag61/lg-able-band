import { useEffect, useMemo, useRef, useState } from 'react'
import { requestVoiceChat } from '../services/voiceChatbotService'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

const closeKeywords = ['챗봇 꺼줘', '챗봇 종료', '종료해줘', '그만할래', '그만해', '닫아줘']
const wakeKeywords = [
  '챗봇켜줘',
  '챗봇열어줘',
  '챗봇시작',
  '채팅봇켜줘',
  '음성챗봇켜줘',
  '음성챗봇열어줘',
  '에이블밴드',
  'ableband',
  'ai켜줘',
  '에이아이켜줘',
]

const defaultPrompts = [
  '최근 알림 읽어줘',
  '세탁기 몇 분 남았어?',
  '보호자한테 알려줘',
  '장애인 의료비 지원 알려줘',
]

export function VoiceChatbot({ preview, session, summary }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [inputText, setInputText] = useState('')
  const [status, setStatus] = useState('대기 중')
  const [response, setResponse] = useState(null)
  const [followupPromptResponse, setFollowupPromptResponse] = useState(null)
  const [messages, setMessages] = useState([])
  const [error, setError] = useState('')
  const [isRequesting, setIsRequesting] = useState(false)
  const recognitionRef = useRef(null)
  const wakeRecognitionRef = useRef(null)
  const latestTranscriptRef = useRef('')
  const sentTranscriptRef = useRef('')
  const conversationActiveRef = useRef(false)
  const manualStopRef = useRef(false)
  const isOpenRef = useRef(false)
  const wakeListeningRef = useRef(false)
  const recognitionStartingRef = useRef(false)
  const recognitionListeningRef = useRef(false)
  const recognitionStartTimeoutRef = useRef(null)
  const conversationEndRef = useRef(null)
  const requestInFlightRef = useRef(false)
  const lastInfoAgentRef = useRef(null)

  const supportsSpeechRecognition = Boolean(SpeechRecognition)
  const chatbotContext = useMemo(() => createChatbotContext(summary, preview), [preview, summary])
  const hasFollowupPrompts = Boolean(followupPromptResponse?.infoCard)

  useEffect(() => {
    isOpenRef.current = isOpen

    if (!isOpen) {
      // eslint-disable-next-line react-hooks/immutability
      startWakeListening()
    }
  }, [isOpen])

  useEffect(() => {
    startWakeListening()

    return () => {
      wakeListeningRef.current = false
      window.clearTimeout(recognitionStartTimeoutRef.current)
      wakeRecognitionRef.current?.stop()
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

  useEffect(() => {
    if (typeof conversationEndRef.current?.scrollIntoView === 'function') {
      conversationEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, isListening, status])

  function openChatbot() {
    isOpenRef.current = true
    stopWakeListening()
    conversationActiveRef.current = true
    manualStopRef.current = false
    setIsOpen(true)
    setError('')
    setStatus('안내 중...')
    speak('무엇을 확인할까요? 말씀해주세요.', () => {
      startListening()
    })
  }

  function closeChatbot() {
    isOpenRef.current = false
    conversationActiveRef.current = false
    manualStopRef.current = true
    recognitionStartingRef.current = false
    recognitionListeningRef.current = false
    window.clearTimeout(recognitionStartTimeoutRef.current)
    window.speechSynthesis?.cancel()
    recognitionRef.current?.stop()
    setIsListening(false)
    setStatus('대화 종료')
    setIsOpen(false)
    startWakeListening()
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
    recognition.interimResults = false
    recognition.continuous = false

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')

      if (shouldOpenChatbot(transcript)) {
        openChatbot()
      }
    }

    recognition.onerror = () => {
      wakeListeningRef.current = false

      if (!isOpenRef.current) {
        window.setTimeout(() => {
          startWakeListening()
        }, 900)
      }
    }

    recognition.onend = () => {
      wakeListeningRef.current = false

      if (!isOpenRef.current) {
        window.setTimeout(() => {
          startWakeListening()
        }, 450)
      }
    }

    wakeRecognitionRef.current = recognition
    return recognition
  }

  function startWakeListening() {
    if (!SpeechRecognition || isOpenRef.current || wakeListeningRef.current) {
      return
    }

    const recognition = ensureWakeRecognition()
    if (!recognition) {
      return
    }

    try {
      wakeListeningRef.current = true
      recognition.start()
    } catch {
      wakeListeningRef.current = false
    }
  }

  function stopWakeListening() {
    const wasListening = wakeListeningRef.current
    wakeListeningRef.current = false
    wakeRecognitionRef.current?.stop()
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
        setStatus('음성 인식 완료')
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

      setStatus(event.error === 'no-speech' ? '음성을 기다리고 있어요' : '음성 인식 오류')
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
    setStatus('일시 정지')
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
        speak('잘 못 들었어요. 다시 말씀해주세요.', () => {
          startListening()
        })
      }
      return
    }

    if (shouldCloseChatbot(trimmedText)) {
      setInputText(trimmedText)
      setStatus('대화 종료 중...')
      speak('음성 챗봇을 종료할게요.', () => {
        closeChatbot()
      })
      return
    }

    const isFollowup = Boolean(displayText && visibleText !== trimmedText)
    const pendingMessage = createChatMessage('bot', '', { pending: true })
    const requestStartedAt = new Date(pendingMessage.createdAt).getTime()
    requestInFlightRef.current = true
    setIsRequesting(true)
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
      if (data.infoCard) {
        lastInfoAgentRef.current = {
          title: data.infoCard.title,
          category: data.classification?.category,
          priority: data.classification?.priority,
          source: data.infoCard.source,
          summary: data.infoCard.summary,
          recommendedAction: data.infoCard.recommendedAction,
          importantFields: infoCardImportantFields(data.infoCard),
        }
        setFollowupPromptResponse(data)
      }
      setResponse(data)
      setMessages((previousMessages) => previousMessages.map((message) => (
        message.id === pendingMessage.id
          ? {
              ...message,
              pending: false,
              text: data.answerText || '응답을 받았습니다.',
              data,
              hideInfoCard: isFollowup,
            }
          : message
      )))
      setStatus('응답 중...')
      speak(data.voiceText || data.answerText, () => {
        setStatus('응답 완료')
      })
    } catch (requestError) {
      await waitForMinimumDuration(requestStartedAt, 350)
      const errorText = requestError.message || '음성 챗봇 연결에 실패했습니다.'
      setError(errorText)
      setMessages((previousMessages) => previousMessages.map((message) => (
        message.id === pendingMessage.id
          ? {
              ...message,
              pending: false,
              error: true,
              text: '연결에 실패했어요. 잠시 후 다시 시도해 주세요.',
            }
          : message
      )))
      setStatus('연결 실패')

      if (continueConversation) {
        speak('연결에 실패했어요. 잠시 후 다시 시도해 주세요.')
      }
    } finally {
      requestInFlightRef.current = false
      setIsRequesting(false)
    }
  }

  function sendRecognizedText(text) {
    const trimmedText = text.trim()
    if (!trimmedText || sentTranscriptRef.current === trimmedText) {
      return
    }

    sentTranscriptRef.current = trimmedText
    sendMessage(trimmedText)
  }

  function speak(text, onEnd) {
    if (!text || !('speechSynthesis' in window)) {
      onEnd?.()
      return
    }

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.onend = () => {
      onEnd?.()
    }
    utterance.onerror = () => {
      onEnd?.()
    }
    window.speechSynthesis.speak(utterance)
  }

  return (
    <>
      <button
        className="voice-chatbot-fab"
        type="button"
        aria-label="음성 챗봇 열기"
        onClick={openChatbot}
      >
        AI
      </button>

      {isOpen ? (
        <section className="voice-chatbot-panel" aria-label="음성 챗봇">
          <div className="voice-chatbot-header">
            <div className="voice-chatbot-brand">
              <span className="voice-ai-avatar" aria-hidden="true">AI</span>
              <div>
                <h2>AI 음성 챗봇</h2>
                <p className="card-label">LG Able Band</p>
              </div>
            </div>
            <button type="button" className="voice-close-button" aria-label="음성 챗봇 닫기" onClick={closeChatbot}>
              ×
            </button>
          </div>

          <div className="voice-chatbot-status-row" role="status" aria-live="polite">
            <span className={`voice-status-dot ${isListening || isRequesting ? 'is-active' : ''}`} />
            <span>{compactStatusLabel(status, isRequesting, isListening)}</span>
          </div>
          {error ? <p className="voice-chatbot-error">{error}</p> : null}

          <div
            className="voice-chatbot-answer voice-chatbot-scroll-area"
            aria-label="음성 챗봇 대화 내용"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <div className="voice-empty-state">
                <strong>무엇을 확인할까요?</strong>
                <p>알림, 가전 상태, 복지 지원 정보를 물어볼 수 있어요.</p>
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
                          onReplay={() => speak(message.data.voiceText || message.data.answerText)}
                        />
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
                  onClick={() => setFollowupPromptResponse(null)}
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
                      onClick={() => sendMessage(requestText, false, prompt)}
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
                placeholder="말씀하거나 입력해 주세요."
                onChange={(event) => setInputText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    sendMessage(inputText, false)
                  }
                }}
              />
            </label>

            <button
              className={`voice-chatbot-icon-button voice-chatbot-mic ${isListening ? 'is-active' : ''}`}
              type="button"
              aria-label={isListening ? '음성 인식 중지' : '음성 입력 시작'}
              disabled={!supportsSpeechRecognition || isRequesting}
              onClick={() => {
                conversationActiveRef.current = true
                manualStopRef.current = false
                if (isListening) {
                  stopListening()
                } else {
                  startListening()
                }
              }}
            >
              <span aria-hidden="true">🎙</span>
            </button>

            <button
              className="primary-button compact-button voice-chatbot-send"
              type="button"
              aria-label="텍스트로 보내기"
              disabled={isRequesting || !inputText.trim()}
              onClick={() => sendMessage(inputText, false)}
            >
              {isRequesting ? '…' : '↗'}
            </button>
          </div>

          {!hasFollowupPrompts ? (
            <div className="voice-sample-block">
              <strong className="voice-followup-label">✦ 추천 질문</strong>
              <div className="voice-sample-row" aria-label="추천 질문">
                {defaultPrompts.slice(0, 4).map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    disabled={isRequesting}
                    onClick={() => sendMessage(prompt, false)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  )
}

function InfoAgentCard({ response, onReplay }) {
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
        <button
          type="button"
          className="compact-button"
          aria-label="AI 접근성 정보 저장하기"
          onClick={() => {
            // TODO: Connect the saved information API when it is available.
          }}
        >
          저장하기
        </button>
        {showUrgentActions && response.notifyGuardian ? (
          <button
            type="button"
            className="primary-button compact-button"
            aria-label="보호자에게 이 정보 공유하기"
            onClick={() => {
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

function createChatMessage(role, text, extra = {}) {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    createdAt: new Date().toISOString(),
    ...extra,
  }
}

function shouldCloseChatbot(text) {
  return closeKeywords.some((keyword) => text.includes(keyword))
}

function shouldOpenChatbot(text) {
  const normalizedText = normalizeSpeechText(text)
  return wakeKeywords.some((keyword) => normalizedText.includes(normalizeSpeechText(keyword)))
}

function normalizeSpeechText(text) {
  return text.toLowerCase().replace(/\s+/g, '')
}

function compactStatusLabel(status, isRequesting, isListening) {
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
  }
}

function createDeviceContext(devices) {
  const washer = findDevice(devices, 'WASHER')
  const refrigerator = findDevice(devices, 'REFRIGERATOR')
  const airSensor = findDevice(devices, 'AIR_SENSOR')
  const tv = findDevice(devices, 'TV')
  const range = findDevice(devices, 'RANGE')
  const doorSensor = findDevice(devices, 'DOOR_SENSOR')

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
  }
}

function findDevice(devices, type) {
  return devices.find((device) => device.type === type)
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
