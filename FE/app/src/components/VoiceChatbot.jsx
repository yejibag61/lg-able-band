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

const samplePrompts = [
  '미확인 알림 있어?',
  '위험 알림 있어?',
  '최근 알림 읽어줘',
  '방금 알림 다시 말해줘',
  '세탁기 몇 분 남았어?',
  '냉장고 문 열려 있어?',
  '보호자한테 알려줘',
]

export function VoiceChatbot({ preview, session, summary }) {
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
  const chatbotContext = useMemo(() => createChatbotContext(summary, preview), [preview, summary])

  useEffect(() => {
    isOpenRef.current = isOpen

    if (!isOpen) {
      startWakeListening()
    }
  }, [isOpen])

  useEffect(() => {
    startWakeListening()

    return () => {
      wakeListeningRef.current = false
      wakeRecognitionRef.current?.stop()
      recognitionRef.current?.stop()
      window.speechSynthesis?.cancel()
    }
  }, [])

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
    wakeListeningRef.current = false
    wakeRecognitionRef.current?.stop()
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
  }

  function startListening() {
    if (!conversationActiveRef.current) {
      return
    }

    const recognition = ensureRecognition()
    if (!recognition) {
      setError('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 사용을 권장합니다.')
      return
    }

    try {
      recognition.start()
    } catch {
      // Recognition may already be running while Chrome settles between turns.
    }
  }

  function stopListening() {
    manualStopRef.current = true
    recognitionRef.current?.stop()
    setStatus('일시 정지')
  }

  async function sendMessage(text = inputText, continueConversation = conversationActiveRef.current) {
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
        sessionId: 'app-demo',
        text: trimmedText,
        language: 'ko-KR',
        user: {
          userId: summary?.user?.userId || session?.account?.id || 1,
          name: summary?.user?.name || session?.account?.name || '',
          accessibilityType: summary?.user?.accessibilityType || 'VISUAL',
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
            <div>
              <p className="card-label">음성 챗봇</p>
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
              rows={3}
              placeholder="예: 세탁기 몇 분 남았어?"
              onChange={(event) => setInputText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  sendMessage(inputText, false)
                }
              }}
            />
          </label>

          <button className="primary-button compact-button" type="button" onClick={() => sendMessage(inputText, false)}>
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
