import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { mockAppPreview } from '../mocks/appPreviewMock'
import { AlertsTab } from './AlertsTab'

const API_BASE_URL = 'http://localhost:8080'

describe('AlertsTab', () => {
  beforeEach(() => {
    window.localStorage.setItem('lg-able-band.accessToken', 'api-user-token')
    window.scrollTo = vi.fn()
    window.HTMLElement.prototype.scrollTo = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('shows appliance-specific alert examples in the list', () => {
    render(<AlertsTab accessibilityType="VISUAL" alerts={mockAppPreview.alerts} />)

    expect(screen.getByText('세탁 완료')).toBeTruthy()
    expect(screen.getByText('TV 리모컨 찾기')).toBeTruthy()
    expect(screen.getByText('전기레인지 과열 주의')).toBeTruthy()
    expect(screen.getByText('도어센서 장시간 열림')).toBeTruthy()
  })

  it('hides emergency request receipts while keeping real emergency alerts visible', async () => {
    const user = userEvent.setup()
    const alerts = [
      {
        alertId: 301,
        type: 'EMERGENCY',
        severity: 'CRITICAL',
        title: '긴급 지원 요청 접수',
        message: '사용자가 앱에서 긴급 지원을 요청했습니다.',
        deviceName: 'Able Band 앱',
        locationName: '앱',
        occurredAt: '2026-06-10T14:35:00+09:00',
        status: 'ESCALATED',
      },
      {
        alertId: 302,
        type: 'EMERGENCY',
        severity: 'CRITICAL',
        title: '가스 누출 긴급 감지',
        message: '주방 센서에서 긴급 위험 신호가 감지되었습니다.',
        deviceName: '가스 감지 센서',
        locationName: '주방',
        occurredAt: '2026-06-10T14:34:00+09:00',
        status: 'UNREAD',
      },
      ...mockAppPreview.alerts,
    ]

    render(<AlertsTab accessibilityType="VISUAL" alerts={alerts} />)

    expect(screen.queryByText('긴급 지원 요청 접수')).toBeNull()
    expect(screen.getByText('가스 누출 긴급 감지')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '긴급' }))

    expect(screen.queryByText('긴급 지원 요청 접수')).toBeNull()
    expect(screen.getByText('가스 누출 긴급 감지')).toBeTruthy()
  })

  it('does not show delivery recommendation fields for ordinary life alerts', async () => {
    const user = userEvent.setup()
    render(<AlertsTab accessibilityType="VISUAL" alerts={mockAppPreview.alerts} />)

    await user.click(screen.getByRole('button', { name: '세탁 완료 상세 보기' }))

    expect(findWarningRecommendationCall()).toBeUndefined()
    expect(screen.queryByText('전달 수단')).toBeNull()
    expect(screen.queryByText('보조 안내')).toBeNull()
  })

  it('shows delivery recommendation fields for danger alerts from recommendation data', async () => {
    const user = userEvent.setup()
    render(<AlertsTab accessibilityType="VISUAL" alerts={mockAppPreview.alerts} />)

    await user.click(screen.getByRole('button', { name: '전기레인지 과열 주의 상세 보기' }))

    expect(await screen.findByText('전달 수단')).toBeTruthy()
    expect(screen.getByText('밴드 진동 · 앱 화면 · 보호자 알림')).toBeTruthy()
    expect(screen.getByText('보조 안내')).toBeTruthy()
    expect(screen.getByText('반복 진동 · 고대비 화면 · 음성 안내 사용')).toBeTruthy()
    expect(findWarningRecommendationCall()).toBeTruthy()
  })
})

async function mockFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url
  const method = (init.method || 'GET').toUpperCase()

  if (url === `${API_BASE_URL}/api/warnings/recommendations` && method === 'POST') {
    return jsonResponse({
      recommendedChannels: ['BAND_VIBRATION', 'APP_SCREEN'],
      vibrationPattern: 'BASIC_REPEAT',
      screenMode: 'HIGH_CONTRAST',
      voiceEnabled: true,
      notifyGuardian: false,
    })
  }

  return jsonResponse({ message: 'not found' }, { status: 404 })
}

function findWarningRecommendationCall() {
  return globalThis.fetch.mock.calls.find(([url, init = {}]) => {
    return url === `${API_BASE_URL}/api/warnings/recommendations` && init.method === 'POST'
  })
}

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
