import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { HomeScreen } from './HomeScreen'

const API_BASE_URL = 'http://localhost:8080'

const session = {
  account: {
    name: '엘지',
    email: 'user@example.com',
  },
  userProfile: {
    accessibilityType: 'VISUAL',
  },
}

const homeSummary = {
  user: {
    name: '엘지',
    accessibilityType: 'VISUAL',
  },
  safetyStatus: {
    level: 'SAFE',
    message: 'Able Band가 안전 상태를 확인하고 있습니다.',
    lastCheckedAt: '2026-06-10T14:30:00+09:00',
  },
  recentAlerts: [],
  deviceSummary: {
    totalCount: 1,
    connectedCount: 1,
    warningCount: 0,
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

describe('HomeScreen accessibility settings', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('lg-able-band.accessToken', 'api-user-token')
    window.scrollTo = vi.fn()
    window.HTMLElement.prototype.scrollTo = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('saves accessibility toggles without changing the base home colors by default', async () => {
    const user = userEvent.setup()
    render(<HomeScreen session={session} onLogout={() => {}} />)

    const app = await screen.findByRole('main', { name: '엘지 홈' })
    await user.click(screen.getByRole('button', { name: '설정' }))

    expect(screen.getByText('접근성 설정')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /큰 글씨/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /고대비/ })).toBeNull()
    expect(app.className).not.toContain('high-contrast')
    expect(app.className).not.toContain('large-text')

    await user.click(screen.getByRole('button', { name: /음성 안내/ }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('접근성 설정을 저장했습니다.')
    })

    const saveCall = findAccessibilitySaveCall()
    expect(saveCall).toBeTruthy()
    expect(JSON.parse(saveCall[1].body)).toEqual({
      accessibilityType: 'VISUAL',
      notificationPrefs: {
        channels: ['VIBRATION'],
        highContrast: true,
        largeText: true,
      },
    })
    expect(screen.getByText('음성 안내 OFF')).toBeTruthy()
  })
})

async function mockFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url
  const method = (init.method || 'GET').toUpperCase()
  const body = init.body ? JSON.parse(init.body) : {}

  if (url === `${API_BASE_URL}/api/app/home` && method === 'GET') {
    return jsonResponse(homeSummary)
  }

  if (url === `${API_BASE_URL}/api/alerts?limit=20` && method === 'GET') {
    return jsonResponse({ items: [] })
  }

  if (url === `${API_BASE_URL}/api/devices` && method === 'GET') {
    return jsonResponse({ items: [] })
  }

  if (url === `${API_BASE_URL}/api/guardians` && method === 'GET') {
    return jsonResponse({ items: [] })
  }

  if (url === `${API_BASE_URL}/api/users/me` && method === 'GET') {
    return jsonResponse({
      role: 'USER',
      userId: 1,
      name: '엘지',
      email: 'user@example.com',
      accessibilityType: 'VISUAL',
      notificationPrefs: {
        channels: ['VOICE', 'VIBRATION'],
        highContrast: true,
        largeText: true,
      },
    })
  }

  if (url === `${API_BASE_URL}/api/users/me/accessibility` && method === 'PUT') {
    return jsonResponse({
      accessibilityType: body.accessibilityType,
      notificationPrefs: body.notificationPrefs,
    })
  }

  return jsonResponse({ message: 'not found' }, { status: 404 })
}

function findAccessibilitySaveCall() {
  return globalThis.fetch.mock.calls.find(([url, init = {}]) => {
    return url === `${API_BASE_URL}/api/users/me/accessibility` && init.method === 'PUT'
  })
}

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
