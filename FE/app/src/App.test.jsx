import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { mockHomeSummary } from './mocks/homeMock'
import { mockAppPreview } from './mocks/appPreviewMock'

const API_BASE_URL = 'http://localhost:8080'
const REQUEST_DELAY_MS = 80

describe('App login to home flow', () => {
  beforeEach(() => {
    window.localStorage.clear()
    installSpeechSynthesisMock()
    installMockBackend()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('renders login screen by default and does not request legacy users table', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
    expect(screen.getByLabelText('이메일')).toBeTruthy()
    expect(screen.getByLabelText('비밀번호')).toBeTruthy()
    expect(screen.getByRole('button', { name: '로그인' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '회원가입' })).toBeTruthy()
    expect(screen.queryByText('Users Table')).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('opens signup screen from login and returns to login', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))

    expect(screen.getByRole('heading', { name: 'Able Band 회원가입' })).toBeTruthy()
    expect(screen.getByLabelText('이름')).toBeTruthy()
    expect(screen.getByLabelText('비밀번호 확인')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '로그인으로 돌아가기' }))

    expect(screen.getByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
  })

  it('clears signup password fields after returning to login', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인으로 돌아가기' }))
    await user.click(screen.getByRole('button', { name: '회원가입' }))

    expect(screen.getByLabelText('비밀번호').value).toBe('')
    expect(screen.getByLabelText('비밀번호 확인').value).toBe('')
  })

  it('shows USER signup constraints before submitting API signup', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect((await screen.findByRole('alert')).textContent).toContain('이름은 2자 이상 입력해주세요.')

    await user.type(screen.getByLabelText('이름'), '가')
    await user.type(screen.getByLabelText('이메일'), 'bad-email')
    await user.type(screen.getByLabelText('비밀번호'), 'short')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'different')
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    const errorText = (await screen.findByRole('alert')).textContent
    expect(errorText).toContain('올바른 이메일 형식으로 입력해주세요.')
    expect(errorText).toContain('비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.')
    expect(errorText).toContain('비밀번호가 일치하지 않습니다.')
  })

  it('submits USER signup API and returns to login with the new email filled', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))
    await user.type(screen.getByLabelText('이름'), '김사용')
    await user.type(screen.getByLabelText('이메일'), 'new-user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'password1234')
    await user.click(screen.getByRole('radio', { name: '시각장애인' }))
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(await screen.findByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
    expect(screen.getByDisplayValue('new-user@example.com')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('회원가입이 완료되었습니다. 로그인해주세요.')
  })

  it('applies accessibility defaults when the signup disability type changes', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))

    expect(screen.getByRole('checkbox', { name: '음성 안내' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: '진동 안내' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: '고대비' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: '큰 글씨' }).checked).toBe(true)

    await user.click(screen.getByRole('radio', { name: '청각장애인' }))

    expect(screen.getByRole('checkbox', { name: '음성 안내' }).checked).toBe(false)
    expect(screen.getByRole('checkbox', { name: '진동 안내' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: '고대비' }).checked).toBe(true)
    expect(screen.getByRole('checkbox', { name: '큰 글씨' }).checked).toBe(true)
  })

  it('shows required-field error on empty login submit', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      '이메일과 비밀번호를 모두 입력해주세요.',
    )
  })

  it('routes USER login to the home screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: /소희 홈/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy()
    expect(screen.getByText('Able Band가 실시간 안전 상태를 확인 중입니다.')).toBeTruthy()
    expect(screen.getByText('오늘의 안전 상태')).toBeTruthy()
    expect(screen.getByRole('button', { name: '긴급 지원 요청' })).toBeTruthy()
  })

  it('lets a USER preview alerts, devices, guardian connection, wearable pairing, and living signals', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /소희 홈/i })

    await user.click(screen.getByRole('button', { name: '기기' }))
    expect(screen.getByRole('heading', { name: '기기와 UWB' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '우리 집 가전을 연결해요.' })).toBeTruthy()
    expect(await screen.findByRole('button', { name: '세탁기 관리 열기' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '알림' }))
    expect(screen.getByRole('heading', { name: '실시간 알림' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '전체' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '메뉴' }))
    expect(screen.getByRole('heading', { name: '메뉴' })).toBeTruthy()
    expect(screen.getByText('보호자 연결')).toBeTruthy()
    expect(screen.getByRole('button', { name: '멤버 초대' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '멤버 초대' }))
    expect(screen.getByRole('heading', { name: '보호자 연결' })).toBeTruthy()
    expect(screen.getByLabelText('보호자 이메일')).toBeTruthy()
    await user.type(screen.getByLabelText('보호자 이메일'), 'guardian2@example.com')
    await user.click(screen.getByRole('button', { name: '보호자 등록' }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('김추가 보호자와 연결했습니다.')
    })

    await user.click(screen.getByRole('button', { name: '메뉴로 돌아가기' }))
    expect(screen.getByRole('button', { name: /밴드 QR을 카메라로 스캔해요\./ })).toBeTruthy()

    installQrScannerMock(
      'lg-able-band://pair?pairingSessionId=pairing-able-260610-1440&deviceId=able-band-demo-001&pairingCode=ABLE-4IN-260610&source=wearable',
    )
    await user.click(screen.getByRole('button', { name: /밴드 QR을 카메라로 스캔해요\./ }))
    expect(screen.getByRole('heading', { name: '밴드 QR을 스캔해주세요.' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('웨어러블 연동이 완료되었습니다.')
    })
    expect(screen.getByText('연동 정보: LG Able Band · able-band-demo-001 · ABLE-4IN-260610')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '메뉴로 돌아가기' }))
    await user.click(screen.getByRole('button', { name: /생활 신호 설정/i }))
    expect(screen.getAllByRole('heading', { name: '생활 신호 설정' }).length).toBeGreaterThan(0)
    expect(screen.getByText('등록된 알림음')).toBeTruthy()
  })

  it('skips the login screen when a session is already stored and returns to login after logout', async () => {
    window.localStorage.setItem('lg-able-band.accessToken', 'api-user-token')
    window.localStorage.setItem(
      'lg-able-band.session',
      JSON.stringify({
        accessToken: 'api-user-token',
        role: 'USER',
        account: {
          accountId: 1,
          name: '소희',
          email: 'user@example.com',
        },
        userProfile: {
          userId: 1,
          name: '소희',
          accessibilityType: 'VISUAL',
        },
      }),
    )

    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('heading', { name: /소희 홈/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /able band 로그인/i })).toBeNull()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '로그아웃' }))

    expect(await screen.findByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
    expect(window.localStorage.getItem('lg-able-band.accessToken')).toBeNull()
    expect(window.localStorage.getItem('lg-able-band.session')).toBeNull()
  })

  it('routes GUARDIAN login to guardian placeholder', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '사용자에게 연락' })).toBeTruthy()
  })

  it('shows invalid login error and keeps the user on login screen', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('이메일'), 'wrong@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'wrong')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      '이메일 또는 비밀번호가 올바르지 않습니다.',
    )
  })
})

function installMockBackend() {
  let alerts = structuredClone(mockAppPreview.alerts)
  const accounts = new Map([
    [
      'USER:user@example.com',
      {
        role: 'USER',
        email: 'user@example.com',
        password: 'password1234',
        accountId: 1,
        name: '소희',
        userId: 1,
        accessibilityType: 'VISUAL',
        accessToken: 'api-user-token',
      },
    ],
    [
      'GUARDIAN:guardian@example.com',
      {
        role: 'GUARDIAN',
        email: 'guardian@example.com',
        password: 'password1234',
        accountId: 2,
        name: '보호자',
        guardianId: 1,
        linkedUserId: 1,
        relationship: 'FAMILY',
        accessToken: 'api-guardian-token',
      },
    ],
    [
      'GUARDIAN:guardian2@example.com',
      {
        role: 'GUARDIAN',
        email: 'guardian2@example.com',
        password: 'password1234',
        accountId: 4,
        name: '김추가',
        phone: '010-1111-2222',
        guardianId: 4,
        linkedUserId: null,
        relationship: 'FAMILY',
        accessToken: 'api-guardian-token-4',
      },
    ],
  ])
  let nextAccountId = 3
  let guardians = [
    {
      guardianId: 1,
      name: '보호자',
      phone: '010-0000-0000',
      isPrimary: true,
      notifyOnDanger: true,
      connectionStatus: 'CONNECTED',
    },
  ]

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    await delay(REQUEST_DELAY_MS)

    const url = typeof input === 'string' ? input : input.url
    const method = (init.method || 'GET').toUpperCase()
    const body = init.body ? JSON.parse(init.body) : {}

    if (url === `${API_BASE_URL}/api/auth/signup` && method === 'POST') {
      const accountKey = accountMapKey(body.role, body.email)
      if (accounts.has(accountKey)) {
        return jsonResponse(
          { code: 'DUPLICATE_EMAIL', message: '이미 가입된 이메일입니다.', details: {} },
          { status: 409 },
        )
      }

      const accountId = nextAccountId
      nextAccountId += 1
      const account = {
        ...body,
        accountId,
        userId: body.role === 'USER' ? accountId : null,
        guardianId: body.role === 'GUARDIAN' ? accountId : null,
        accessToken: `api-${body.role.toLowerCase()}-token-${accountId}`,
      }

      accounts.set(accountKey, account)

      return jsonResponse(
        {
          accountId: account.accountId,
          role: account.role,
          userId: account.userId,
          name: account.name,
          email: account.email,
          accessibilityType: account.accessibilityType,
        },
        { status: 201 },
      )
    }

    if (url === `${API_BASE_URL}/api/auth/login` && method === 'POST') {
      const account = accounts.get(accountMapKey(body.role, body.email))
      if (!account || account.password !== body.password) {
        return jsonResponse(
          { code: 'INVALID_CREDENTIALS', message: '이메일 또는 비밀번호가 올바르지 않습니다.', details: {} },
          { status: 401 },
        )
      }

      return jsonResponse(createLoginResponse(account))
    }

    if (url === `${API_BASE_URL}/api/app/home` && method === 'GET') {
      const authorization = new Headers(init.headers).get('Authorization')
      const isKnownUserToken =
        authorization === 'Bearer api-user-token' ||
        authorization?.startsWith('Bearer api-user-token-')

      if (!isKnownUserToken) {
        return jsonResponse(
          { code: 'UNAUTHORIZED', message: 'Authorization 헤더가 필요합니다.', details: {} },
          { status: 401 },
        )
      }

      return jsonResponse(mockHomeSummary)
    }

    if (url === `${API_BASE_URL}/api/alerts?limit=20` && method === 'GET') {
      return jsonResponse({ items: alerts })
    }

    const alertActionMatch = url.match(/\/api\/alerts\/(\d+)\/(confirm|replay)$/)
    if (alertActionMatch && method === 'POST') {
      const alertId = Number(alertActionMatch[1])
      const status = alertActionMatch[2] === 'confirm' ? 'CONFIRMED' : 'REPLAYED'
      const alert = alerts.find((item) => item.alertId === alertId)
      alerts = alerts.map((item) => (item.alertId === alertId ? { ...item, status } : item))
      return jsonResponse({ ...alert, status })
    }

    if (url === `${API_BASE_URL}/api/emergency-requests` && method === 'POST') {
      return jsonResponse(
        {
          emergencyRequestId: 301,
          status: 'SENT',
          message: '보호자에게 긴급 요청을 보냈습니다.',
          source: 'APP',
          sentAt: '2026-06-10T14:35:00+09:00',
          guardianNotified: true,
        },
        { status: 201 },
      )
    }

    if (url === `${API_BASE_URL}/api/guardians` && method === 'GET') {
      return jsonResponse({ items: guardians })
    }

    if (url === `${API_BASE_URL}/api/guardians/dashboard` && method === 'GET') {
      return jsonResponse({
        user: {
          userId: 1,
          name: '소희',
          accessibilityType: 'VISUAL',
        },
        dangerAlerts: mockAppPreview.alerts.filter(
          (alert) => alert.type === 'DANGER' || alert.severity === 'HIGH',
        ),
        emergencyRequests: [
          {
            emergencyRequestId: 301,
            status: 'SENT',
            message: '사용자가 앱에서 긴급 지원을 요청했습니다.',
            source: 'APP',
            sentAt: '2026-06-10T14:35:00+09:00',
            guardianNotified: true,
          },
        ],
        summary: {
          unreadDangerAlertCount: 2,
          emergencyRequestCount: 1,
          activeEmergency: true,
          safetyMessage: '긴급 도움 요청이 진행 중입니다.',
        },
      })
    }

    if (url === `${API_BASE_URL}/api/guardians/link-by-email` && method === 'POST') {
      const account = accounts.get(accountMapKey('GUARDIAN', body.email))
      if (!account) {
        return jsonResponse(
          { code: 'RESOURCE_NOT_FOUND', message: '해당 이메일의 보호자 계정을 찾을 수 없습니다.', details: {} },
          { status: 404 },
        )
      }

      if (body.isPrimary) {
        guardians = guardians.map((guardian) => ({ ...guardian, isPrimary: false }))
      }

      const guardian = {
        guardianId: account.guardianId,
        name: account.name,
        phone: account.phone || '',
        isPrimary: body.isPrimary,
        notifyOnDanger: body.notifyOnDanger,
        connectionStatus: 'CONNECTED',
      }
      guardians = [...guardians.filter((item) => item.guardianId !== guardian.guardianId), guardian]

      return jsonResponse(guardian, { status: 201 })
    }

    const guardianDeleteMatch = url.match(/\/api\/guardians\/(\d+)$/)
    if (guardianDeleteMatch && method === 'DELETE') {
      const guardianId = Number(guardianDeleteMatch[1])
      guardians = guardians.filter((guardian) => guardian.guardianId !== guardianId)
      return new Response(null, { status: 204 })
    }

    return jsonResponse(
      { code: 'NOT_FOUND', message: `테스트 mock API에 없는 경로입니다: ${url}`, details: {} },
      { status: 404 },
    )
  })
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
      getVoices: vi.fn(() => [{ lang: 'ko-KR', name: 'Korean' }]),
      resume: vi.fn(),
      speak: vi.fn(),
    },
  })
}

function installQrScannerMock(rawValue) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
  })

  vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue()
  Object.defineProperty(window.HTMLMediaElement.prototype, 'readyState', {
    configurable: true,
    get: () => 2,
  })
  Object.defineProperty(window.HTMLVideoElement.prototype, 'videoWidth', {
    configurable: true,
    get: () => 640,
  })
  Object.defineProperty(window.HTMLVideoElement.prototype, 'videoHeight', {
    configurable: true,
    get: () => 480,
  })
  vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  })
  Object.defineProperty(window, 'BarcodeDetector', {
    configurable: true,
    value: class MockBarcodeDetector {
      async detect() {
        return [{ rawValue }]
      }
    },
  })
}

function createLoginResponse(account) {
  const baseResponse = {
    accessToken: account.accessToken,
    role: account.role,
    account: {
      accountId: account.accountId,
      name: account.name,
      email: account.email,
    },
  }

  if (account.role === 'GUARDIAN') {
    return {
      ...baseResponse,
      guardianProfile: {
        guardianId: account.guardianId,
        linkedUserId: account.linkedUserId || null,
        relationship: account.relationship,
      },
    }
  }

  return {
    ...baseResponse,
    userProfile: {
      userId: account.userId,
      name: account.name,
      accessibilityType: account.accessibilityType,
    },
  }
}

function accountMapKey(role, email) {
  return `${role}:${email}`
}

function jsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
