import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { requestVoiceChat } from '../services/voiceChatbotService'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

const closeKeywords = ['챗봇 꺼줘', '챗봇 종료', '종료해줘', '그만할래', '그만해', '닫아줘']
const wakeKeywords = [
  '챗봇켜줘',
  '챗봇열어줘',
  '챗봇시작',
  '음성챗봇켜줘',
  '음성챗봇열어줘',
  '에이블밴드',
  'ableband',
  'ai켜줘',
  '에이아이켜줘',
]

const samplePrompts = [
  '지금 알림 뭐야?',
  '위험 알림 있어?',
  '방금 알림 다시 말해줘',
  '보호자한테 알려줘',
  '세탁기 어디 있어?',
]

export function VoiceChatbot({ alert, alertQueue, mode, statusMessage, uwbSession }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [inputText, setInputText] = useState('')
  const [status, setStatus] = useState('대기 중')
  const [response, setResponse] = useState(null)
  const [error, setError] = useState('')
  const recognitionRef = useRef(null)
  const wakeRecognitionRef = useRef(null)
  const latestTranscriptRef = useRef('')
  const sentTranscriptRef = useRef('')
  const conversationActiveRef = useRef(false)
  const manualStopRef = useRef(false)
  const isOpenRef = useRef(false)
  const wakeListeningRef = useRef(false)

  const supportsSpeechRecognition = Boolean(SpeechRecognition)
  const chatbotContext = useMemo(
    () => createWearableChatbotContext({ alert, alertQueue, mode, statusMessage, uwbSession }),
    [alert, alertQueue, mode, statusMessage, uwbSession],
  )

  const speak = useCallback((text, onEnd) => {
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
  }, [])

  const startListening = useCallback(() => {
    if (!conversationActiveRef.current) {
      return
    }

    const recognition = ensureRecognition()
    if (!recognition) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다. 텍스트로 입력해주세요.')
      return
    }

    try {
      recognition.start()
    } catch {
      // Chrome can briefly keep the recognizer busy between turns.
    }
  }, [])

  const sendMessage = useCallback(
    async (text = inputText, continueConversation = conversationActiveRef.current) => {
      const trimmedText = text.trim()
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

      setStatus('챗봇 응답 요청 중...')
      setError('')

      try {
        const data = await requestVoiceChat({
          sessionId: 'wearable-demo',
          text: trimmedText,
          language: 'ko-KR',
          user: {
            userId: 1,
            name: '웨어러블 사용자',
            accessibilityType: 'VISUAL',
            guardianLinked: true,
          },
          context: chatbotContext,
        })

        setResponse(data)
        setStatus('응답 중...')
        speak(data.voiceText || data.answerText, () => {
          if (continueConversation && conversationActiveRef.current) {
            setStatus('계속 듣는 중...')
            startListening()
          } else {
            setStatus('응답 완료')
          }
        })
      } catch (requestError) {
        setError(requestError.message || '음성 챗봇 연결에 실패했습니다.')
        setStatus('연결 실패')

        if (continueConversation) {
          speak('연결에 실패했어요. 잠시 후 다시 말씀해주세요.', () => {
            startListening()
          })
        }
      }
    },
    [chatbotContext, inputText, speak, startListening],
  )

  const sendRecognizedText = useCallback(
    (text) => {
      const trimmedText = text.trim()
      if (!trimmedText || sentTranscriptRef.current === trimmedText) {
        return
      }

      sentTranscriptRef.current = trimmedText
      sendMessage(trimmedText)
    },
    [sendMessage],
  )

  const ensureRecognition = useCallback(() => {
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
      setIsListening(false)

      if (!conversationActiveRef.current || manualStopRef.current) {
        return
      }

      setError(`음성 인식 오류: ${event.error}`)
      setStatus('다시 안내 중...')
      speak('잘 못 들었어요. 다시 말씀해주세요.', () => {
        startListening()
      })
    }

    recognition.onend = () => {
      setIsListening(false)

      if (!conversationActiveRef.current || manualStopRef.current) {
        return
      }

      const transcript = latestTranscriptRef.current.trim()
      if (transcript) {
        sendRecognizedText(transcript)
        return
      }

      setStatus('다시 안내 중...')
      speak('잘 못 들었어요. 다시 말씀해주세요.', () => {
        startListening()
      })
    }

    recognitionRef.current = recognition
    return recognition
  }, [sendRecognizedText, speak, startListening])

  const openChatbot = useCallback(() => {
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
  }, [speak, startListening])

  const ensureWakeRecognition = useCallback(() => {
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
  }, [openChatbot])

  const startWakeListening = useCallback(() => {
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
  }, [ensureWakeRecognition])

  useEffect(() => {
    isOpenRef.current = isOpen

    if (!isOpen) {
      startWakeListening()
    }
  }, [isOpen, startWakeListening])

  useEffect(() => {
    startWakeListening()

    return () => {
      wakeListeningRef.current = false
      wakeRecognitionRef.current?.stop()
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [startWakeListening])

  function closeChatbot() {
    isOpenRef.current = false
    conversationActiveRef.current = false
    manualStopRef.current = true
    window.speechSynthesis?.cancel()
    recognitionRef.current?.stop()
    setIsListening(false)
    setStatus('대화 종료')
    setIsOpen(false)
    startWakeListening()
  }

  function stopWakeListening() {
    wakeListeningRef.current = false
    wakeRecognitionRef.current?.stop()
  }

  function stopListening() {
    manualStopRef.current = true
    recognitionRef.current?.stop()
    setStatus('일시 정지')
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
            <div>
              <p className="eyebrow">음성 챗봇</p>
              <h2>무엇을 확인할까요?</h2>
            </div>
            <button type="button" className="voice-close-button" onClick={closeChatbot}>
              닫기
            </button>
          </div>

          <p className="voice-chatbot-status">{status}</p>
          {error ? <p className="voice-chatbot-error">{error}</p> : null}

          <div className="voice-chatbot-actions">
            <button
              type="button"
              onClick={() => {
                conversationActiveRef.current = true
                startListening()
              }}
              disabled={isListening}
            >
              {supportsSpeechRecognition ? '다시 말하기' : '음성 미지원'}
            </button>
            <button type="button" onClick={stopListening} disabled={!isListening}>
              일시 정지
            </button>
          </div>

          <label className="voice-chatbot-field">
            <span>인식된 문장</span>
            <textarea
              value={inputText}
              rows={2}
              placeholder="예: 지금 알림 뭐야?"
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendMessage(inputText, false)
                }
              }}
            />
          </label>

          <button className="primary-action mini-action" type="button" onClick={() => sendMessage(inputText, false)}>
            텍스트로 보내기
          </button>

          <div className="voice-sample-row">
            {samplePrompts.map((prompt) => (
              <button
                type="button"
                key={prompt}
                onClick={() => {
                  setInputText(prompt)
                  sendMessage(prompt, false)
                }}
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="voice-chatbot-answer">
            <strong>{response?.answerText || '응답이 여기에 표시됩니다.'}</strong>
            {response ? (
              <span>
                {response.intent} · {response.action}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  )
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

function createWearableChatbotContext({ alert, alertQueue, mode, statusMessage, uwbSession }) {
  const alerts = alertQueue || []
  const mappedAlerts = alerts.map(mapAlert)

  return {
    mode,
    statusMessage,
    currentAlert: alert ? mapAlert(alert) : null,
    unreadAlerts: mappedAlerts.filter((item) => item.status === 'UNREAD'),
    dangerAlerts: mappedAlerts.filter((item) => ['HIGH', 'CRITICAL'].includes(item.severity)),
    lastSpokenAlert: alert ? mapAlert(alert) : null,
    uwb: uwbSession
      ? {
          targetDeviceName: uwbSession.targetDeviceName,
          distanceM: uwbSession.distanceM,
          confidence: uwbSession.confidence,
          navigationStatus: uwbSession.navigationStatus,
        }
      : null,
  }
}

function mapAlert(alert) {
  return {
    id: alert.alertId,
    deviceType: alert.type,
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    status: alert.status,
    deviceName: alert.deviceName,
    locationName: alert.locationName,
    createdAt: alert.occurredAt,
  }
}
