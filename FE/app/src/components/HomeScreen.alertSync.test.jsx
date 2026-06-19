import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { HomeScreen } from './HomeScreen'

const API_BASE_URL = 'http://localhost:8080'

const session = {
  account: {
    name: '소희',
  },
  userProfile: {
    accessibilityType: 'VISUAL',
  },
}

const homeSummary = {
  user: {
    name: '소희',
  },
  safetyStatus: {
    level: 'DANGER',
    message: '전기레인지 확인이 필요합니다.',
    lastCheckedAt: '2026-06-10T14:30:00+09:00',
  },
  recentAlerts: [
    {
      alertId: 201,
      type: 'DANGER',
      severity: 'HIGH',
      title: '전기레인지 과열 주의',
      message: '주방에서 위험 신호가 감지되었습니다.',
      deviceName: '전기레인지',
      occurredAt: '2026-06-10T14:20:00+09:00',
      status: 'UNREAD',
    },
  ],
  deviceSummary: {
    totalCount: 2,
    connectedCount: 2,
    warningCount: 1,
    uwbSupportedCount: 1,
  },
  emergency: {
    enabled: true,
    primaryGuardianName: '보호자',
  },
  quickActions: {
    canRequestEmergency: true,
  },
}

const previewAlerts = [
  {
    alertId: 201,
    type: 'DANGER',
    severity: 'HIGH',
    title: '전기레인지 과열 주의',
    message: '주방에서 위험 신호가 감지되었습니다.',
    deviceName: '전기레인지',
    occurredAt: '2026-06-10T14:20:00+09:00',
    status: 'UNREAD',
    recommendedAction: '전원을 끄고 주변을 확인해 주세요.',
  },
]

let currentHomeSummary
let currentPreviewAlerts
let deleteResponseDelay

describe('HomeScreen alert summary sync', () => {
  beforeEach(() => {
    currentHomeSummary = structuredClone(homeSummary)
    currentPreviewAlerts = structuredClone(previewAlerts)
    deleteResponseDelay = null
    window.localStorage.setItem('lg-able-band.accessToken', 'api-user-token')
    window.scrollTo = vi.fn()
    window.HTMLElement.prototype.scrollTo = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('removes confirmed alerts from the home real-time summary', async () => {
    const user = userEvent.setup()
    render(<HomeScreen session={session} onLogout={() => {}} />)

    await screen.findByRole('heading', { name: '소희 홈' })
    expect(screen.getByText('전기레인지 과열 주의')).toBeTruthy()
    expect(screen.getByText('최근 알림 1건')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '알림' }))
    await user.click(screen.getByRole('button', { name: '전기레인지 과열 주의 확인 완료' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('알림을 확인 완료로 처리했습니다.')
    })

    expect(screen.queryByText('전기레인지 과열 주의')).toBeNull()
    expect(screen.getByText('조건에 맞는 알림이 없습니다.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '홈' }))

    const homeContent = within(screen.getByText('실시간 알림 요약').closest('section'))
    expect(homeContent.queryByText('전기레인지 과열 주의')).toBeNull()
    expect(homeContent.getByText('최근 알림이 없습니다.')).toBeTruthy()
    expect(screen.getByText('최근 알림 0건')).toBeTruthy()
  })

  it('keeps deleted alerts removed after returning to the alerts tab', async () => {
    const user = userEvent.setup()
    render(<HomeScreen session={session} onLogout={() => {}} />)

    await screen.findByRole('heading', { name: '소희 홈' })
    await user.click(screen.getByRole('button', { name: '알림' }))
    await user.click(screen.getByRole('button', { name: '전기레인지 과열 주의 삭제' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('알림을 목록에서 삭제했습니다.')
    })

    expect(findFetchCall('/api/alerts/201', 'DELETE')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '홈' }))
    await user.click(screen.getByRole('button', { name: '알림' }))

    expect(screen.queryByText('전기레인지 과열 주의')).toBeNull()
    expect(screen.getByText('조건에 맞는 알림이 없습니다.')).toBeTruthy()
  })

  it('removes deleted alerts from the visible list before the delete API finishes', async () => {
    const user = userEvent.setup()
    let resolveDelete
    deleteResponseDelay = new Promise((resolve) => {
      resolveDelete = resolve
    })
    render(<HomeScreen session={session} onLogout={() => {}} />)

    await screen.findByRole('heading', { name: '소희 홈' })
    await user.click(screen.getByRole('button', { name: '알림' }))
    await user.click(screen.getByRole('button', { name: '전기레인지 과열 주의 삭제' }))

    expect(screen.queryByText('전기레인지 과열 주의')).toBeNull()
    expect(findFetchCall('/api/alerts/201', 'DELETE')).toBeTruthy()

    resolveDelete()

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('알림을 목록에서 삭제했습니다.')
    })
  })

  it('uses the same alert records as the alerts tab for the home real-time summary', async () => {
    currentHomeSummary = {
      ...homeSummary,
      recentAlerts: [
        {
          alertId: 301,
          type: 'DANGER',
          severity: 'HIGH',
          title: '요약 API에만 있는 오래된 알림',
          message: '이 알림은 알림 탭 목록에는 없습니다.',
          deviceName: '요약 센서',
          occurredAt: '2026-06-10T14:10:00+09:00',
          status: 'UNREAD',
        },
      ],
    }
    currentPreviewAlerts = [
      {
        alertId: 302,
        type: 'DANGER',
        severity: 'HIGH',
        title: '알림 탭과 같은 최신 알림',
        message: '홈에서도 이 알림을 보여줘야 합니다.',
        deviceName: '알림 센서',
        occurredAt: '2026-06-10T14:25:00+09:00',
        status: 'UNREAD',
      },
    ]

    render(<HomeScreen session={session} onLogout={() => {}} />)

    await screen.findByRole('heading', { name: '소희 홈' })

    const homeContent = within(screen.getByText('실시간 알림 요약').closest('section'))
    expect(homeContent.queryByText('요약 API에만 있는 오래된 알림')).toBeNull()
    expect(homeContent.getByText('알림 탭과 같은 최신 알림')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: '알림' }))
    expect(screen.getByText('알림 탭과 같은 최신 알림')).toBeTruthy()
  })

  it('reloads the home summary and alert records from the status refresh control', async () => {
    const user = userEvent.setup()
    render(<HomeScreen session={session} onLogout={() => {}} />)

    await screen.findByRole('heading', { name: '소희 홈' })
    expect(screen.getByText('전기레인지 과열 주의')).toBeTruthy()

    currentHomeSummary = {
      ...homeSummary,
      safetyStatus: {
        ...homeSummary.safetyStatus,
        lastCheckedAt: '2026-06-10T14:40:00+09:00',
      },
      recentAlerts: [],
    }
    currentPreviewAlerts = [
      {
        alertId: 401,
        type: 'DANGER',
        severity: 'HIGH',
        title: '새로고침된 최신 알림',
        message: '새로고침 후 홈에서도 보여야 합니다.',
        deviceName: '새 센서',
        occurredAt: '2026-06-10T14:40:00+09:00',
        status: 'UNREAD',
      },
    ]

    await user.click(screen.getByRole('button', { name: '홈 정보 새로고침' }))

    await waitFor(() => {
      expect(screen.getByText('새로고침된 최신 알림')).toBeTruthy()
    })
    expect(screen.queryByText('전기레인지 과열 주의')).toBeNull()
  })
})

async function mockFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url
  const method = (init.method || 'GET').toUpperCase()

  if (url === `${API_BASE_URL}/api/app/home` && method === 'GET') {
    return jsonResponse(currentHomeSummary)
  }

  if (url === `${API_BASE_URL}/api/alerts?limit=20` && method === 'GET') {
    return jsonResponse({ items: currentPreviewAlerts })
  }

  if (url === `${API_BASE_URL}/api/devices` && method === 'GET') {
    return jsonResponse({ items: [] })
  }

  if (url === `${API_BASE_URL}/api/guardians` && method === 'GET') {
    return jsonResponse({ items: [] })
  }

  if (url === `${API_BASE_URL}/api/alerts/201/confirm` && method === 'POST') {
    return jsonResponse({ ...currentPreviewAlerts[0], status: 'CONFIRMED' })
  }

  if (url === `${API_BASE_URL}/api/alerts/201` && method === 'DELETE') {
    if (deleteResponseDelay) {
      await deleteResponseDelay
    }

    currentPreviewAlerts = currentPreviewAlerts.filter((alert) => alert.alertId !== 201)
    currentHomeSummary = {
      ...currentHomeSummary,
      recentAlerts: currentHomeSummary.recentAlerts.filter((alert) => alert.alertId !== 201),
    }
    return new Response(null, { status: 204 })
  }

  return jsonResponse({ message: 'not found' }, { status: 404 })
}

function findFetchCall(path, method = 'GET') {
  return globalThis.fetch.mock.calls.find(([url, init = {}]) => {
    return url === `${API_BASE_URL}${path}` && (init.method || 'GET').toUpperCase() === method
  })
}

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
