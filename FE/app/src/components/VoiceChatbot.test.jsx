import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { VoiceChatbot } from './VoiceChatbot'

describe('VoiceChatbot info agent response', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = vi.fn()
    installSpeechSynthesisMock()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('renders the accessible info card and reads voiceText again', async () => {
    const user = userEvent.setup()
    mockVoiceChatResponse({
      intent: 'INFO_AGENT_QUERY',
      action: 'SHOW_INFO_CARD',
      answerText: '폭염 안전 정보를 안내합니다.',
      voiceText: '폭염 위험 안내입니다. 즉시 안전 수칙을 확인하세요.',
      infoCard: {
        title: '장애인 폭염 대처 방법',
        summary: '더운 시간대 외출을 피하고 충분히 수분을 섭취하세요.',
        recommendedAction: '몸에 이상이 느껴지면 즉시 119에 연락하세요.',
        source: '보건복지부',
        url: 'https://example.com/heatwave',
      },
      classification: {
        category: '재난/안전',
        priority: 'URGENT',
      },
      notificationTabMessage: '폭염 위험. 외출을 자제하세요.',
      bandMessage: '폭염 위험. 외출 자제',
      recommendedChannels: ['APP', 'BAND', 'GUARDIAN'],
      notifyGuardian: true,
    })

    render(<VoiceChatbot preview={{}} session={{}} summary={{}} />)
    await user.click(screen.getByRole('button', { name: '음성 챗봇 열기' }))
    await user.type(screen.getByLabelText('인식된 문장'), '폭염 때 어떻게 해야 해?')
    await user.click(screen.getByRole('button', { name: '텍스트로 보내기' }))

    expect(await screen.findByRole('article', { name: 'AI 접근성 정보 카드' })).toBeTruthy()
    expect(screen.getByText('장애인 폭염 대처 방법')).toBeTruthy()
    expect(screen.getByText('재난/안전')).toBeTruthy()
    expect(screen.getByText('중요도 URGENT')).toBeTruthy()
    expect(screen.getByText('폭염 위험. 외출 자제')).toBeTruthy()
    expect(screen.getByText('보호자에게 공유할 수 있어요.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '보호자에게 이 정보 공유하기' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '자세히 보기' }).target).toBe('_blank')

    await user.click(screen.getByRole('button', { name: 'AI 접근성 정보 다시 듣기' }))

    expect(window.speechSynthesis.speak).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: '폭염 위험 안내입니다. 즉시 안전 수칙을 확인하세요.',
      }),
    )
  })

  it('keeps the existing chatbot response free of info agent controls', async () => {
    const user = userEvent.setup()
    mockVoiceChatResponse({
      intent: 'DEVICE_STATUS_CHECK',
      action: 'READ_DEVICE_STATUS',
      answerText: '세탁 완료까지 12분 남았습니다.',
      voiceText: '세탁 완료까지 12분 남았습니다.',
    })

    render(<VoiceChatbot preview={{}} session={{}} summary={{}} />)
    await user.click(screen.getByRole('button', { name: '음성 챗봇 열기' }))
    await user.type(screen.getByLabelText('인식된 문장'), '세탁기 몇 분 남았어?')
    await user.click(screen.getByRole('button', { name: '텍스트로 보내기' }))

    expect(await screen.findByText('세탁 완료까지 12분 남았습니다.')).toBeTruthy()
    expect(screen.queryByRole('article', { name: 'AI 접근성 정보 카드' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'AI 접근성 정보 다시 듣기' })).toBeNull()
    expect(screen.queryByLabelText('정보 후속 질문')).toBeNull()

    await waitFor(() => {
      expect(latestVoiceChatRequestBody()).toEqual(expect.objectContaining({ text: '세탁기 몇 분 남았어?' }))
    })
  })

  it('keeps previous user and bot messages when a new question is sent', async () => {
    const user = userEvent.setup()
    mockVoiceChatResponses(
      {
        intent: 'ALERT_LIST',
        action: 'READ_ALERTS',
        answerText: '최근 알림은 한 건입니다.',
        voiceText: '최근 알림은 한 건입니다.',
      },
      {
        intent: 'DEVICE_STATUS_CHECK',
        action: 'READ_DEVICE_STATUS',
        answerText: '세탁 완료까지 12분 남았습니다.',
        voiceText: '세탁 완료까지 12분 남았습니다.',
      },
    )

    render(<VoiceChatbot preview={{}} session={{}} summary={{}} />)
    await user.click(screen.getByRole('button', { name: '음성 챗봇 열기' }))
    await user.type(screen.getByLabelText('인식된 문장'), '최근 알림 읽어줘')
    await user.click(screen.getByRole('button', { name: '텍스트로 보내기' }))
    await screen.findByText('최근 알림은 한 건입니다.')

    await user.type(screen.getByLabelText('인식된 문장'), '세탁기 몇 분 남았어?')
    await user.click(screen.getByRole('button', { name: '텍스트로 보내기' }))

    expect(await screen.findByText('세탁 완료까지 12분 남았습니다.')).toBeTruthy()
    expect(screen.getAllByText('최근 알림 읽어줘').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('최근 알림은 한 건입니다.')).toBeTruthy()
    expect(screen.getAllByText('세탁기 몇 분 남았어?').length).toBeGreaterThanOrEqual(2)
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })
})

function mockVoiceChatResponse(data) {
  mockVoiceChatResponses(data)
}

function mockVoiceChatResponses(...responses) {
  for (const data of responses) {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => data,
    })
  }
}

function latestVoiceChatRequestBody() {
  const lastCall = globalThis.fetch.mock.calls.at(-1)
  return JSON.parse(lastCall?.[1]?.body || '{}')
}

function installSpeechSynthesisMock() {
  class MockSpeechSynthesisUtterance {
    constructor(text) {
      this.text = text
    }
  }

  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: MockSpeechSynthesisUtterance,
  })
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      cancel: vi.fn(),
      speak: vi.fn(),
    },
  })
}
