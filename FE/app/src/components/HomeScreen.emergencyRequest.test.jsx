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

const homeSummaryWithoutGuardian = {
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
    enabled: false,
    primaryGuardianName: '',
  },
  quickActions: {
    canRequestEmergency: false,
  },
}

describe('HomeScreen emergency request', () => {
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

  it('asks the user to register a guardian when SOS is clicked without one', async () => {
    const user = userEvent.setup()
    render(<HomeScreen session={session} onLogout={() => {}} />)

    await screen.findByRole('heading', { name: '엘지 홈' })
    const sosButton = screen.getByRole('button', { name: '긴급 지원 요청' })

    expect(sosButton.disabled).toBe(false)

    await user.click(sosButton)

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('보호자를 등록')
    })
    expect(findEmergencyRequestCall()).toBeUndefined()
  })
})

async function mockFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url
  const method = (init.method || 'GET').toUpperCase()

  if (url === `${API_BASE_URL}/api/app/home` && method === 'GET') {
    return jsonResponse(homeSummaryWithoutGuardian)
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
        highContrast: false,
        largeText: false,
      },
    })
  }

  return jsonResponse({ message: 'not found' }, { status: 404 })
}

function findEmergencyRequestCall() {
  return globalThis.fetch.mock.calls.find(([url, init = {}]) => {
    return url === `${API_BASE_URL}/api/emergency-requests` && init.method === 'POST'
  })
}

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
