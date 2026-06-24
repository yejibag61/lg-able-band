import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoiceChatbot } from './VoiceChatbot'

describe('wearable VoiceChatbot button selection', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.removeItem('lg-able-band.wearableAccessToken')
  })

  it('opens directly on the category screen and then shows recommendations', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    const { container } = render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'AI에게 묻기' })).toBeTruthy()
    expect(screen.getByText('어떤 정보를 알려드릴까요?')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '복지 정보 질문: 의료비 지원' })).toBeNull()
    expect(screen.queryByRole('button', { name: '대신말하기' })).toBeNull()
    expect(screen.getByRole('button', { name: '음성 챗봇 시작' })).toBeTruthy()
    expect(container.querySelectorAll('.wearable-ai-category-card').length).toBeGreaterThan(0)

    await user.click(container.querySelector('.wearable-ai-category-card'))
    expect(screen.getByRole('heading', { name: '복지 정보' })).toBeTruthy()
    expect(container.querySelectorAll('.wearable-ai-question-button')).toHaveLength(5)
    expect(screen.getByRole('button', { name: '복지 정보 질문: 의료비 지원' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '복지 정보 질문: 교통비 지원' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '복지 정보 질문: 보조기기 지원' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '복지 정보 질문: 활동지원 서비스' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '복지 정보 질문: 직접 질문하기' })).toBeTruthy()

    await user.click(container.querySelector('.wearable-ai-question-button'))

    await waitFor(() => {
      expect(container.querySelector('.wearable-ai-answer-card')).toBeTruthy()
      expect(screen.queryByText('답변을 준비하고 있어요.')).toBeNull()
    }, { timeout: 3500 })
    expect(screen.getByRole('heading', { name: 'AI 답변' })).toBeTruthy()
    expect(screen.queryByLabelText('중요도 NORMAL')).toBeNull()
    expect(screen.queryByText(/출처:/)).toBeNull()
    const welfareCardActions = container.querySelector('.wearable-welfare-card-actions')
    expect(welfareCardActions?.querySelectorAll('button')).toHaveLength(4)
    expect(welfareCardActions?.textContent).toContain('신청 방법')
    expect(welfareCardActions?.textContent).toContain('문의처')
    expect(welfareCardActions?.textContent).toContain('지원 대상')
    expect(welfareCardActions?.textContent).toContain('앱에서 자세히')
    expect(screen.getByText('더 궁금한 것이 있나요?')).toBeTruthy()
    const welfareFollowups = container.querySelector('.wearable-ai-followups')
    expect(welfareFollowups?.querySelectorAll('button')).toHaveLength(2)
    expect(welfareFollowups?.textContent).not.toContain('신청 방법')
    expect(welfareFollowups?.textContent).not.toContain('지원 대상')
    expect(welfareFollowups?.textContent).not.toContain('문의처')
    expect(screen.getByRole('button', { name: '다른 질문 보기' })).toBeTruthy()
  })

  it('shows the selected category recommendation list and keeps direct question on the voice path', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )    await user.click(screen.getByRole('button', { name: '생활/안전' }))

    expect(screen.getByRole('heading', { name: '생활/안전' })).toBeTruthy()
    expect(container.querySelectorAll('.wearable-ai-question-button')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '생활/안전 질문: 최근 알림 확인' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '생활/안전 질문: 위험 알림 확인' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '생활/안전 질문: 읽지 않은 알림 확인' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '생활/안전 질문: 직접 질문하기' }))

    expect(container.querySelectorAll('.wearable-ai-category-card')).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: 'AI 답변' })).toBeNull()
  })

  it('renders safety answers as a compact alert card without welfare details', async () => {
    const alerts = [
      { alertId: 1, title: '냉장고 문 열림 알림', message: '문이 열려 있어요.', type: 'LIFE', status: 'UNREAD' },
      { alertId: 2, title: '세탁 완료 알림', message: '세탁이 끝났어요.', type: 'LIFE', status: 'UNREAD' },
      { alertId: 3, title: '공기질 주의 알림', message: '환기가 필요해요.', type: 'DANGER', status: 'UNREAD' },
    ]
    window.localStorage.setItem('lg-able-band.wearableAccessToken', 'wearable-test-token')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (String(url) === '/api/alerts?limit=20') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => ({ items: alerts }),
        }
      }

      return {
        ok: false,
        status: 401,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ code: 'UNAUTHORIZED' }),
      }
    })
    const user = userEvent.setup()
    const { container } = render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )    await user.click(screen.getByRole('button', { name: '생활/안전' }))
    await user.click(screen.getByRole('button', { name: '생활/안전 질문: 최근 알림 확인' }))

    await waitFor(() => {
      expect(container.querySelector('.wearable-safety-alert-card')).toBeTruthy()
      expect(screen.getByText(/전체 알림은 3건입니다/)).toBeTruthy()
    }, { timeout: 3500 })

    expect(screen.getByRole('heading', { name: '최근 알림 확인' })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledWith('/api/alerts?limit=20', expect.any(Object))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('중요도 HIGH')).toBeNull()
    expect(screen.queryByText('해야 할 일')).toBeNull()
    expect(screen.queryByText(/출처:/)).toBeNull()
    expect(screen.queryByRole('button', { name: '신청 방법' })).toBeNull()
    expect(screen.queryByRole('button', { name: '문의처' })).toBeNull()
    expect(screen.queryByRole('button', { name: '지원 대상' })).toBeNull()
    expect(screen.queryByRole('button', { name: '앱에서 자세히' })).toBeNull()
    expect(screen.getByRole('button', { name: '닫기' })).toBeTruthy()
    window.localStorage.removeItem('lg-able-band.wearableAccessToken')
  })

  it('renders guardian requests as compact result cards and sends the mapped queries', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ answerText: '요청 처리 완료' }),
    })
    const user = userEvent.setup()
    const { container } = render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )    await user.click(screen.getByRole('button', { name: '보호자 연결' }))

    expect(screen.getByRole('heading', { name: '보호자 연결' })).toBeTruthy()
    expect(screen.getByText('추천 질문을 선택하세요')).toBeTruthy()
    expect(container.querySelectorAll('.wearable-ai-question-button')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '보호자 연결 질문: 보호자에게 연결 요청' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '보호자 연결 질문: 긴급 도움 요청' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '보호자 연결 질문: 최근 보호자 알림 확인' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '보호자 연결 질문: 직접 질문하기' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '보호자 연결 질문: 보호자에게 연결 요청' }))
    await waitFor(() => expect(screen.getByText('보호자에게 연결 요청을 보냈어요.')).toBeTruthy())
    expect(screen.getByText('곧 확인할 수 있도록 알림을 전달했어요.')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([, options]) => JSON.parse(options.body).text === '보호자에게 연결 요청해줘')).toBe(true)
    expect(container.querySelector('.wearable-guardian-request-card')).toBeTruthy()
    expect(screen.queryByText('해야 할 일')).toBeNull()
    expect(screen.queryByText(/출처:/)).toBeNull()
    expect(screen.queryByRole('button', { name: '신청 방법' })).toBeNull()
    expect(screen.queryByRole('button', { name: '앱에서 자세히' })).toBeNull()

    await user.click(screen.getByRole('button', { name: '닫기' }))
    await user.click(screen.getByRole('button', { name: '보호자 연결 질문: 긴급 도움 요청' }))
    await waitFor(() => expect(screen.getByText('긴급 도움 요청을 보냈어요.')).toBeTruthy())
    expect(screen.getByText('보호자에게 즉시 알림을 전달했어요.')).toBeTruthy()
    expect(fetchMock.mock.calls.some(([, options]) => JSON.parse(options.body).text === '긴급 도움 요청해줘')).toBe(true)

    await user.click(screen.getByRole('button', { name: '닫기' }))
    await user.click(screen.getByRole('button', { name: '보호자 연결 질문: 최근 보호자 알림 확인' }))
    await waitFor(() => expect(screen.getByText('최근 보호자 알림을 확인했어요.')).toBeTruthy())
    expect(fetchMock.mock.calls.some(([, options]) => JSON.parse(options.body).text === '최근 보호자 알림 확인해줘')).toBe(true)
  })

  it('passes the unread-alert recommendation to the app chatbot unread filter', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        items: [
          { alertId: 1, title: '확인한 알림', message: '확인 완료', type: 'LIFE', status: 'CONFIRMED' },
          { alertId: 2, title: '읽지 않은 알림 1', message: '확인이 필요해요.', type: 'LIFE', status: 'UNREAD' },
          { alertId: 3, title: '읽지 않은 알림 2', message: '확인이 필요해요.', type: 'DANGER', status: 'UNREAD' },
        ],
      }),
    })
    const user = userEvent.setup()
    render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )    await user.click(screen.getByRole('button', { name: '생활/안전' }))
    await user.click(screen.getByRole('button', { name: '생활/안전 질문: 읽지 않은 알림 확인' }))

    expect(await screen.findByText(/미확인 알림은 2건입니다/)).toBeTruthy()
    expect(screen.queryByText(/확인한 알림/)).toBeNull()
  })

  it('renders appliance status answers as wearable cards', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    const { container } = render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )    await user.click(screen.getByRole('button', { name: '가전 상태' }))
    await user.click(screen.getByRole('button', { name: '가전 상태 질문: 세탁기 상태 알려줘' }))

    await waitFor(() => {
      expect(container.querySelector('.wearable-appliance-main-card')).toBeTruthy()
      expect(container.querySelector('.wearable-appliance-answer-screen')?.className).toContain('status-normal')
    }, { timeout: 3500 })

    expect(screen.getByRole('heading', { name: '세탁기 상태 알려줘' })).toBeTruthy()
    expect(screen.queryByLabelText('해야 할 일')).toBeNull()
    expect(screen.getByLabelText('빠른 액션')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '앱에서 자세히' })).toBeTruthy()
    expect(screen.getByLabelText('후속 질문')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다른 가전 보기' })).toBeTruthy()
  })

  it('sends the connected appliance state with a device question', async () => {
    localStorage.setItem('lg-able-band.wearableAccessToken', 'wearable-token')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options = {}) => {
      if (url === '/api/devices') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => ({
            items: [{
              deviceId: 10,
              name: '세탁기',
              type: 'WASHER',
              connectionStatus: 'CONNECTED',
              room: '세탁실',
              runtime: { statusCode: 'RUNNING', remainingMinutes: 12 },
            }],
          }),
        }
      }

      if (String(url).endsWith('/api/ai/voice-chat')) {
        return {
          ok: true,
          json: async () => ({ answerText: '세탁기 상태는 RUNNING입니다.' }),
        }
      }

      throw new Error(`unexpected request: ${url} ${options.method || 'GET'}`)
    })
    const user = userEvent.setup()
    render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )    await user.click(screen.getByRole('button', { name: '가전 상태' }))
    await user.click(screen.getByRole('button', { name: '가전 상태 질문: 세탁기 상태 알려줘' }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/ai/voice-chat'))).toBe(true)
    })

    const chatbotCall = fetchMock.mock.calls.findLast(([url]) => String(url).endsWith('/api/ai/voice-chat'))
    expect(JSON.parse(chatbotCall[1].body).context.devices.washer).toEqual({
      status: 'RUNNING',
      remainingMinutes: 12,
      error: false,
    })
    expect(screen.getByText('현재 상태: 작동 중')).toBeTruthy()
    expect(screen.getByText('남은 시간: 약 12분')).toBeTruthy()
    expect(screen.queryByText(/예를 들면 세탁기 상태/)).toBeNull()
    localStorage.removeItem('lg-able-band.wearableAccessToken')
  })

  it('uses the electric-range state instead of a stale AI danger priority for its badge', async () => {
    localStorage.setItem('lg-able-band.wearableAccessToken', 'wearable-token')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url === '/api/devices') {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => ({ items: [{ deviceId: 12, name: '전기레인지', type: 'RANGE', connectionStatus: 'CONNECTED', runtime: { powerOn: false, longOn: false } }] }),
        }
      }

      if (String(url).endsWith('/api/ai/voice-chat')) {
        return { ok: true, json: async () => ({ answerText: '전기레인지 상태는 정상입니다.', priority: 'DANGER' }) }
      }

      throw new Error(`unexpected request: ${url}`)
    })
    const user = userEvent.setup()
    const { container } = render(<VoiceChatbot embedded isPaired mode="idle" notificationSettings={{ voiceGuide: false, vibrationGuide: false }} />)    await user.click(screen.getByRole('button', { name: '가전 상태' }))
    await user.click(screen.getByRole('button', { name: '가전 상태 질문: 전기레인지 상태 확인해줘' }))

    expect(await screen.findByText('전기레인지는 꺼져 있어요.', {}, { timeout: 3500 })).toBeTruthy()
    await waitFor(() => {
      expect(container.querySelector('.wearable-appliance-answer-screen')?.className).toContain('status-normal')
    })
  })

  it('uses the appliance context when a recommended device question receives a clarification prompt', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ answerText: '어떤 상태를 확인할지 조금 더 구체적으로 말해주세요.' }),
    })
    const user = userEvent.setup()
    render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )    await user.click(screen.getByRole('button', { name: '가전 상태' }))
    await user.click(screen.getByRole('button', { name: '가전 상태 질문: 세탁기 상태 알려줘' }))

    await waitFor(() => {
      expect(screen.getByText('현재 상태: 작동 중')).toBeTruthy()
    }, { timeout: 3500 })
    expect(screen.getByText('남은 시간: 약 12분')).toBeTruthy()
    expect(screen.queryByText('어떤 상태를 확인할지 조금 더 구체적으로 말해주세요.')).toBeNull()
  })

  it('shows the complete device question list with separate arrow space', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )    await user.click(screen.getByRole('button', { name: '가전 상태' }))

    expect(container.querySelectorAll('.wearable-device-question-button')).toHaveLength(8)
    expect(screen.getByRole('button', { name: '가전 상태 질문: 냉장고 문 열려 있어?' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '가전 상태 질문: 전기레인지 상태 확인해줘' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '가전 상태 질문: 도어센서 상태 확인해줘' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /TV 알림/ })).toBeNull()
    expect(container.querySelectorAll('.wearable-device-question-button .wearable-question-chevron')).toHaveLength(8)
  })

  it('keeps connected device fallback answers compact and non-critical', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    const user = userEvent.setup()
    const { container } = render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )    await user.click(screen.getByRole('button', { name: '가전 상태' }))
    await user.click(screen.getByRole('button', { name: '가전 상태 질문: 연결된 기기 상태 알려줘' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '연결된 기기 상태 알려줘' })).toBeTruthy()
      expect(container.querySelector('.wearable-appliance-answer-screen')?.className).toContain('status-unavailable')
    }, { timeout: 3500 })
    expect(screen.getByText('연결된 기기 상태를 확인하지 못했어요.')).toBeTruthy()
    expect(screen.getByText('다시 확인하거나 다른 가전을 선택해 주세요.')).toBeTruthy()
    expect(screen.getAllByText('연결된 기기 상태 알려줘')).toHaveLength(1)
    expect(container.querySelectorAll('.wearable-appliance-followups .wearable-question-chevron')).toHaveLength(0)
  })

  it('does not expose the substitute speech path in the AI chatbot tab', async () => {
    render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )

    expect(screen.getByRole('heading', { name: 'AI에게 묻기' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '대신말하기' })).toBeNull()
    expect(screen.queryByText('내 말을 대신 전해주세요')).toBeNull()
  })

  it('starts the existing voice listening path from the bottom microphone button', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <VoiceChatbot
        embedded
        isPaired
        mode="idle"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
      />,
    )

    await user.click(screen.getByRole('button', { name: '음성 챗봇 시작' }))

    expect(container.querySelectorAll('.wearable-ai-category-card')).toHaveLength(0)
    expect(screen.queryByRole('heading', { name: 'AI에게 묻기' })).toBeNull()
  })

  it('opens the voice chatbot from a wake command, starts listening, and closes on a close command', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const spokenTexts = []
    const utterances = []
    const speakMock = vi.fn((utterance) => {
      spokenTexts.push(utterance.text)
      utterances.push(utterance)
    })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(text) {
        this.text = text
      }
    })
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      getVoices: vi.fn(() => []),
      pending: false,
      resume: vi.fn(),
      speak: speakMock,
      speaking: false,
    })
    vi.stubGlobal('Audio', class {
      constructor() {
        this.currentTime = 0
      }

      addEventListener(event, callback) {
        if (event === 'ended') {
          window.setTimeout(callback, 0)
        }
      }

      pause() {}

      play() {
        return Promise.resolve()
      }
    })
    const recognitionStarts = []
    class MockRecognition {
      constructor() {
        this.abort = vi.fn()
      }

      start() {
        recognitionStarts.push(this)
        this.onstart?.()
      }
    }
    vi.stubGlobal('SpeechRecognition', MockRecognition)
    const { container } = render(
      <VoiceChatbot
        isPaired
        mode="alert"
        notificationSettings={{ voiceGuide: false, vibrationGuide: false }}
        showFab={false}
      />,
    )

    expect(container.querySelector('.wearable-chat-screen')).toBeNull()

    await act(async () => {
      globalThis.__ABLE_BAND_OPEN_WEARABLE_CHATBOT__?.()
    })

    await waitFor(() => {
      expect(container.querySelector('.wearable-chat-answer')).toBeTruthy()
    })
    expect(container.querySelectorAll('.wearable-ai-category-card')).toHaveLength(0)
    await waitFor(() => {
      expect(spokenTexts).toContain(
        'AI 챗봇. 무엇을 도와드릴까요? 현재 알림, 가전 상태, 위치 안내, 보호자 연결. 알림을 들은 뒤 원하는 기능을 말씀해주세요.',
      )
    })

    const wakeListeningCount = recognitionStarts.length
    await act(async () => {
      utterances.at(-1)?.onend?.()
    })

    expect(container.querySelector('.wearable-chat-answer')).toBeTruthy()
    expect(container.querySelector('.wearable-chat-speaking')).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600)
    })

    await waitFor(() => {
      expect(container.querySelector('.wearable-chat-speaking')).toBeTruthy()
    })
    expect(recognitionStarts.length).toBeGreaterThan(wakeListeningCount)

    await act(async () => {
      const activeRecognition = recognitionStarts.at(-1)
      activeRecognition?.onresult?.({
        results: [
          {
            0: { transcript: '챗봇 꺼줘' },
            isFinal: true,
            length: 1,
          },
        ],
      })
      activeRecognition?.onend?.()
    })

    await waitFor(() => {
      expect(spokenTexts).toContain('챗봇을 종료할게요.')
    })

    await act(async () => {
      utterances.at(-1)?.onend?.()
    })

    await waitFor(() => {
      expect(container.querySelector('.wearable-chat-screen')).toBeNull()
    })
  })

})
