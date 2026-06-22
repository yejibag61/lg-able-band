import { render, screen, waitFor, within } from '@testing-library/react'
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

let guardians

describe('HomeScreen guardian invite and management', () => {
  beforeEach(() => {
    guardians = [
      {
        guardianId: 1,
        name: '보호자',
        phone: '010-0000-0000',
        isPrimary: true,
        notifyOnDanger: true,
        connectionStatus: 'CONNECTED',
      },
    ]
    window.localStorage.setItem('lg-able-band.accessToken', 'api-user-token')
    window.scrollTo = vi.fn()
    window.HTMLElement.prototype.scrollTo = vi.fn()
    vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('separates member invite from guardian management and registers through the final API', async () => {
    const user = userEvent.setup()
    render(<HomeScreen session={session} onLogout={() => {}} />)

    await screen.findByRole('heading', { name: '엘지 홈' })
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(screen.getByRole('button', { name: '멤버 초대' }))

    expect(screen.getByRole('heading', { name: '보호자 초대' })).toBeTruthy()
    expect(screen.getByLabelText('보호자 이름')).toBeTruthy()
    expect(screen.getByLabelText('보호자 연락처')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '보호자 등록' }))
    expect((await screen.findByRole('alert')).textContent).toContain(
      '보호자 이름을 입력해 주세요.',
    )

    await user.type(screen.getByLabelText('보호자 이름'), '김새롬')
    await user.type(screen.getByLabelText('보호자 연락처'), '010-2222-3333')
    await user.click(screen.getByRole('button', { name: '보호자 등록' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('김새롬 보호자를 등록했습니다.')
    })
    expect(JSON.parse(findGuardianCall('POST')[1].body)).toEqual(
      expect.objectContaining({
        name: '김새롬',
        phone: '010-2222-3333',
        isPrimary: false,
        notifyOnDanger: true,
      }),
    )

    await user.click(screen.getByRole('button', { name: '메뉴로 돌아가기' }))
    await user.click(screen.getByRole('button', { name: '홈 멤버 관리' }))

    expect(screen.getByRole('heading', { name: '보호자 관리' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '보호자 등록' })).toBeNull()
    expect(screen.getByText('김새롬')).toBeTruthy()
  })

  it('updates guardian notification settings and removes guardians from the management screen', async () => {
    const user = userEvent.setup()
    render(<HomeScreen session={session} onLogout={() => {}} />)

    await screen.findByRole('heading', { name: '엘지 홈' })
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(screen.getByRole('button', { name: '홈 멤버 관리' }))

    const guardianCard = screen.getByText('보호자').closest('article')
    expect(within(guardianCard).queryByRole('button', { name: '보호자 대표 보호자' })).toBeNull()

    await user.click(within(guardianCard).getByRole('checkbox', { name: '보호자 위험 알림 수신' }))
    await waitFor(() => {
      expect(findGuardianCall('PUT')).toBeTruthy()
    })
    expect(JSON.parse(findGuardianCall('PUT')[1].body)).toEqual(
      expect.objectContaining({
        name: '보호자',
        phone: '010-0000-0000',
        isPrimary: true,
        notifyOnDanger: false,
      }),
    )

    await user.click(within(guardianCard).getByRole('button', { name: '보호자 삭제' }))
    expect(findGuardianCall('DELETE')).toBeUndefined()
    expect(screen.getByRole('alert').textContent).toContain('보호자를 삭제하려면 한 번 더 눌러주세요.')

    await user.click(within(guardianCard).getByRole('button', { name: '보호자 삭제 확인' }))

    await waitFor(() => {
      expect(findGuardianCall('DELETE')).toBeTruthy()
    })
    expect(screen.queryByText('010-0000-0000')).toBeNull()
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

  if (url === `${API_BASE_URL}/api/guardians` && method === 'GET') {
    return jsonResponse({ items: guardians })
  }

  if (url === `${API_BASE_URL}/api/guardians` && method === 'POST') {
    const nextGuardian = {
      guardianId: 2,
      connectionStatus: 'CONNECTED',
      ...body,
    }
    if (nextGuardian.isPrimary) {
      guardians = guardians.map((guardian) => ({ ...guardian, isPrimary: false }))
    }
    guardians = [...guardians, nextGuardian]
    return jsonResponse(nextGuardian, { status: 201 })
  }

  const guardianMatch = url.match(/\/api\/guardians\/(\d+)$/)
  if (guardianMatch && method === 'PUT') {
    const guardianId = Number(guardianMatch[1])
    const updatedGuardian = {
      guardianId,
      connectionStatus: 'CONNECTED',
      ...body,
    }
    if (updatedGuardian.isPrimary) {
      guardians = guardians.map((guardian) => ({ ...guardian, isPrimary: false }))
    }
    guardians = guardians.map((guardian) =>
      guardian.guardianId === guardianId ? updatedGuardian : guardian,
    )
    return jsonResponse(updatedGuardian)
  }

  if (guardianMatch && method === 'DELETE') {
    const guardianId = Number(guardianMatch[1])
    guardians = guardians.filter((guardian) => guardian.guardianId !== guardianId)
    return new Response(null, { status: 204 })
  }

  return jsonResponse({ message: 'not found' }, { status: 404 })
}

function findGuardianCall(method) {
  return globalThis.fetch.mock.calls.find(([url, init = {}]) => {
    return String(url).includes('/api/guardians') && init.method === method
  })
}

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
