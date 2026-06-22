import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { mockHomeSummary } from './mocks/homeMock'
import { mockAppPreview } from './mocks/appPreviewMock'

const API_BASE_URL = 'http://localhost:8080'
const REQUEST_DELAY_MS = 80
const ORIGINAL_CAMERA_FRAME_TIMEOUT_ENV = import.meta.env.VITE_CAMERA_FRAME_TIMEOUT_MS
const ORIGINAL_ABLE_BAND_CAMERA_FRAME_TIMEOUT_ENV = import.meta.env.VITE_ABLE_BAND_CAMERA_FRAME_TIMEOUT_MS

describe('App login to home flow', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.__ABLE_BAND_QR_DECODER__ = undefined
    window.__ABLE_BAND_CAMERA_FRAME_TIMEOUT_MS__ = undefined
    window.__ABLE_BAND_GUARDIAN_DASHBOARD_ERROR__ = undefined
    window.__ABLE_BAND_GUARDIAN_DASHBOARD_EMPTY_ALERTS__ = undefined
    window.__ABLE_BAND_GUARDIAN_DASHBOARD_NETWORK_DOWN__ = undefined
    window.__ABLE_BAND_GUARDIAN_DASHBOARD_STRICT__ = undefined
    window.__ABLE_BAND_PAIRING_ACCESS_TOKEN__ = undefined
    window.__ABLE_BAND_EMERGENCY_ERROR__ = undefined
    installSpeechSynthesisMock()
    installMockBackend()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete window.__ABLE_BAND_QR_DECODER__
    delete window.__ABLE_BAND_CAMERA_FRAME_TIMEOUT_MS__
    delete window.__ABLE_BAND_GUARDIAN_DASHBOARD_ERROR__
    delete window.__ABLE_BAND_GUARDIAN_DASHBOARD_EMPTY_ALERTS__
    delete window.__ABLE_BAND_GUARDIAN_DASHBOARD_NETWORK_DOWN__
    delete window.__ABLE_BAND_GUARDIAN_DASHBOARD_STRICT__
    delete window.__ABLE_BAND_GUARDIAN_DASHBOARD_POLL_MS__
    delete window.__ABLE_BAND_PAIRING_ERROR__
    delete window.__ABLE_BAND_PAIRING_NETWORK_DOWN__
    delete window.__ABLE_BAND_PAIRING_ACCESS_TOKEN__
    delete window.__ABLE_BAND_EMERGENCY_ERROR__
    restoreCameraFrameTimeoutEnv()
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

    expect(await screen.findByRole('heading', { name: /엘지 홈/i })).toBeTruthy()
    expect(screen.getByText('Able Band가 안전 상태를 확인하고 있습니다.')).toBeTruthy()
    expect(screen.getByText('오늘의 안전 상태')).toBeTruthy()
    expect(screen.getByRole('button', { name: '긴급 지원 요청' })).toBeTruthy()
  })

  it('keeps the management tab hidden for regular USER accounts', async () => {
    const user = userEvent.setup()
    render(<App />)

    await loginAsUser(user)

    const primaryNav = screen.getByRole('navigation', { name: '주요 메뉴' })
    expect(within(primaryNav).getByRole('button', { name: '홈' })).toBeTruthy()
    expect(within(primaryNav).getByRole('button', { name: '기기' })).toBeTruthy()
    expect(within(primaryNav).getByRole('button', { name: '알림' })).toBeTruthy()
    expect(within(primaryNav).getByRole('button', { name: '설정' })).toBeTruthy()
    expect(within(primaryNav).queryByRole('button', { name: '관리' })).toBeNull()
  })

  it('shows the management tab for the admin USER account', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'admin@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /홈/i })
    const primaryNav = screen.getByRole('navigation', { name: '주요 메뉴' })
    await user.click(within(primaryNav).getByRole('button', { name: '관리' }))

    expect(screen.getByRole('heading', { name: '관리' })).toBeTruthy()
    expect(await screen.findByText('관리자 전용')).toBeTruthy()
    expect(screen.getByText('알림 발송')).toBeTruthy()
    expect(screen.getByRole('button', { name: '전체 사용자' })).toBeTruthy()
  })

  it('clears a stale stored session and returns to login when an authenticated request gets 401', async () => {
    window.localStorage.setItem('lg-able-band.accessToken', 'expired-user-token')
    window.localStorage.setItem(
      'lg-able-band.session',
      JSON.stringify(
        createLoginResponse({
          accountId: 1,
          userId: 1,
          accessToken: 'expired-user-token',
          role: 'USER',
          name: '김사용',
          email: 'user@example.com',
          accessibilityType: 'VISUAL',
        }),
      ),
    )

    render(<App />)

    expect(await screen.findByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      '로그인 세션이 만료되었습니다. 다시 로그인해주세요.',
    )
    expect(window.localStorage.getItem('lg-able-band.accessToken')).toBeNull()
    expect(window.localStorage.getItem('lg-able-band.session')).toBeNull()
  })

  it('sends USER emergency requests without showing the request receipt as an alert', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '긴급 지원 요청' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('보호자에게 긴급 요청을 보냈습니다.')
    })
    expect(screen.queryByText('긴급 지원 요청 접수')).toBeNull()

    await user.click(screen.getByRole('button', { name: '알림' }))

    expect(screen.queryByText('긴급 지원 요청 접수')).toBeNull()

    const emergencyCall = globalThis.fetch.mock.calls.find(([url, init]) => {
      return url === `${API_BASE_URL}/api/emergency-requests` && init.method === 'POST'
    })
    expect(emergencyCall).toBeTruthy()
    expect(JSON.parse(emergencyCall[1].body).source).toBe('APP')
  })

  it.each([
    [
      'NO_GUARDIAN',
      '긴급 요청을 받을 보호자가 없습니다. 보호자 연결에서 보호자를 먼저 등록해주세요.',
    ],
    [
      'EMERGENCY_DUPLICATE_COOLDOWN',
      '이미 긴급 요청을 보냈습니다. 잠시 후 다시 시도해주세요.',
    ],
  ])('surfaces emergency backend error %s with recovery guidance', async (code, expectedMessage) => {
    const user = userEvent.setup()
    window.__ABLE_BAND_EMERGENCY_ERROR__ = {
      code,
      message: '요청을 처리하지 못했습니다.',
      status: 409,
    }
    render(<App />)

    await loginAsUser(user)
    await user.click(screen.getByRole('button', { name: '긴급 지원 요청' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(expectedMessage)
    })

    const emergencyCall = findFetchCalls('/api/emergency-requests', 'POST')[0]
    expect(emergencyCall).toBeTruthy()
    expect(JSON.parse(emergencyCall[1].body)).toEqual(
      expect.objectContaining({
        source: 'APP',
        triggerType: 'MANUAL_REQUEST',
      }),
    )
  })

  it('lets a newly signed up USER request emergency with the new account token', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))
    await user.type(screen.getByLabelText('이름'), '긴급사용자')
    await user.type(screen.getByLabelText('이메일'), 'new-user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'password1234')
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(await screen.findByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '긴급 지원 요청' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('보호자에게 긴급 요청을 보냈습니다.')
    })

    const emergencyCall = globalThis.fetch.mock.calls.find(([url, init]) => {
      const authorization = new Headers(init.headers).get('Authorization')
      return (
        url === `${API_BASE_URL}/api/emergency-requests` &&
        init.method === 'POST' &&
        authorization?.startsWith('Bearer api-user-token-')
      )
    })
    expect(emergencyCall).toBeTruthy()
  })

  it('lets a USER preview alerts, devices, guardian connection, wearable pairing, and living signals', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })

    await user.click(screen.getByRole('button', { name: '기기' }))
    expect(screen.getByRole('heading', { name: '기기와 UWB' })).toBeTruthy()
    expect(screen.getAllByRole('region', { name: '내 가전 목록' }).length).toBeGreaterThan(0)
    expect(await screen.findByRole('button', { name: '세탁기 관리 열기' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '알림' }))
    expect(screen.getByRole('heading', { name: '실시간 알림' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '전체' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '설정' }))
    expect(screen.getByRole('heading', { name: '설정' })).toBeTruthy()
    expect(screen.getByText('보호자 연결')).toBeTruthy()
    expect(screen.getByRole('button', { name: '멤버 초대' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '멤버 초대' }))
    expect(screen.getByRole('heading', { name: '보호자 초대' })).toBeTruthy()
    expect(screen.getByLabelText('보호자 이름')).toBeTruthy()
    await user.type(screen.getByLabelText('보호자 이름'), '김추가')
    await user.type(screen.getByLabelText('보호자 연락처'), '010-2222-3333')
    await user.click(screen.getByRole('button', { name: '보호자 등록' }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('김추가 보호자를 등록했습니다.')
    })

    await user.click(screen.getByRole('button', { name: '메뉴로 돌아가기' }))
    expect(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ })).toBeTruthy()

    installQrScannerMock(
      'lg-able-band://pair?pairingSessionId=pairing-able-260610-1440&deviceId=able-band-demo-001&pairingCode=ABLE-4IN-260610&nonce=nonce-able-001&source=wearable',
    )
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    expect(screen.getByRole('region', { name: '밴드 QR을 스캔해주세요.' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('웨어러블 연동이 완료되었습니다.')
    })
    expect(screen.getByText('연동 정보: LG Able Band · able-band-demo-001 · ABLE-4IN-260610')).toBeTruthy()
    expect(findFetchCall('/api/wearable/pairing-sessions/pairing-able-260610-1440/complete', 'POST')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '목록으로 돌아가기' }))
    await user.click(screen.getByRole('button', { name: /생활 신호 설정/i }))
    expect(screen.getAllByRole('heading', { name: '생활 신호 설정' }).length).toBeGreaterThan(0)
    expect(screen.getByText('등록된 알림음')).toBeTruthy()
  })

  it('submits a complete wearable pairing QR payload and refreshes connected devices', async () => {
    const user = userEvent.setup()
    const rawValue =
      'lg-able-band://pair?pairingSessionId=pairing-contract-260612&deviceId=able-band-contract-001&pairingCode=ABLE-4IN-260610&nonce=nonce-contract-001&source=wearable'
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '설정' }))
    installQrScannerMock(rawValue)
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('웨어러블 연동이 완료되었습니다.')
    })
    expect(screen.getByText('연동 정보: LG Able Band · able-band-contract-001 · ABLE-4IN-260610')).toBeTruthy()

    const pairingCall = findFetchCall(
      '/api/wearable/pairing-sessions/pairing-contract-260612/complete',
      'POST',
    )
    expect(pairingCall).toBeTruthy()
    expect(JSON.parse(pairingCall[1].body)).toEqual({
      deviceId: 'able-band-contract-001',
      pairingCode: 'ABLE-4IN-260610',
      nonce: 'nonce-contract-001',
    })

    await user.click(screen.getByRole('button', { name: '기기' }))
    expect(await screen.findByRole('button', { name: 'LG Able Band 관리 열기' })).toBeTruthy()
  })

  it('appEmergencyAfterWearablePairingUsesUserToken', async () => {
    const user = userEvent.setup()
    const rawValue =
      'lg-able-band://pair?pairingSessionId=pairing-token-260612&deviceId=able-band-token-001&pairingCode=ABLE-4IN-260610&nonce=nonce-token-001&source=wearable'
    window.__ABLE_BAND_PAIRING_ACCESS_TOKEN__ = 'api-wearable-token'
    render(<App />)

    await loginAsUser(user)
    expect(window.localStorage.getItem('lg-able-band.accessToken')).toBe('api-user-token')

    await user.click(screen.getByRole('button', { name: '설정' }))
    installQrScannerMock(rawValue)
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('웨어러블 연동이 완료되었습니다.')
    })

    const pairingCall = findFetchCall(
      '/api/wearable/pairing-sessions/pairing-token-260612/complete',
      'POST',
    )
    expect(pairingCall).toBeTruthy()
    expect(new Headers(pairingCall[1].headers).get('Authorization')).toBe('Bearer api-user-token')
    expect(JSON.parse(pairingCall[1].body)).toEqual({
      deviceId: 'able-band-token-001',
      pairingCode: 'ABLE-4IN-260610',
      nonce: 'nonce-token-001',
    })
    expect(window.localStorage.getItem('lg-able-band.accessToken')).toBe('api-user-token')

    await user.click(screen.getByRole('button', { name: '기기' }))
    expect(await screen.findByRole('button', { name: 'LG Able Band 관리 열기' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '홈' }))
    await user.click(screen.getByRole('button', { name: '긴급 지원 요청' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('보호자에게 긴급 요청을 보냈습니다.')
    })

    const emergencyCall = findFetchCalls('/api/emergency-requests', 'POST')[0]
    expect(emergencyCall).toBeTruthy()
    expect(new Headers(emergencyCall[1].headers).get('Authorization')).toBe('Bearer api-user-token')
    expect(JSON.parse(emergencyCall[1].body)).toEqual(
      expect.objectContaining({
        source: 'APP',
        triggerType: 'MANUAL_REQUEST',
      }),
    )
  })

  it('rejects a malformed wearable pairing QR without calling the complete API', async () => {
    const user = userEvent.setup()
    const rawValue =
      'lg-able-band://pair?pairingSessionId=pairing-missing-nonce&deviceId=able-band-demo-001&pairingCode=ABLE-4IN-260610&source=wearable'
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '설정' }))
    installQrScannerMock(rawValue)
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Able Band 연동 QR이 아닙니다.')
    })
    expect(findWearablePairingCompleteCalls()).toHaveLength(0)
  })

  it('rejects a non Able Band QR without calling the complete API', async () => {
    const user = userEvent.setup()
    render(<App />)

    await loginAsUser(user)
    await user.click(screen.getByRole('button', { name: '설정' }))
    installQrScannerMock('https://example.com/not-able-band')
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Able Band 연동 QR이 아닙니다.')
    })
    expect(findWearablePairingCompleteCalls()).toHaveLength(0)
  })

  it.each([
    [
      'PAIRING_SESSION_NOT_FOUND',
      '웨어러블 QR이 현재 앱 백엔드의 공유 DB에 등록되어 있지 않습니다. 앱과 웨어러블을 서로 다른 컴퓨터에서 실행한다면 두 컴퓨터의 BE/.env가 같은 DB를 보게 설정한 뒤 새 QR을 발급해주세요.',
    ],
    [
      'PAIRING_EXPIRED',
      'QR 유효 시간이 지났습니다. 웨어러블에서 새 QR을 발급해주세요.',
    ],
    [
      'PAIRING_ALREADY_COMPLETED',
      '이미 다른 계정과 연결된 QR입니다. 웨어러블에서 연동 해제 후 새 QR을 스캔해주세요.',
    ],
    [
      'INVALID_PAIRING_PAYLOAD',
      '연동 QR 정보가 올바르지 않습니다. 웨어러블 첫 화면의 새 QR을 다시 스캔해주세요.',
    ],
  ])('maps wearable pairing backend error %s to recovery guidance', async (code, expectedMessage) => {
    const user = userEvent.setup()
    const rawValue =
      'lg-able-band://pair?pairingSessionId=pairing-error-260612&deviceId=able-band-error-001&pairingCode=ABLE-4IN-260610&nonce=nonce-error-001&source=wearable'
    window.__ABLE_BAND_PAIRING_ERROR__ = {
      code,
      message: '백엔드 기본 오류 메시지',
      status: code === 'INVALID_PAIRING_PAYLOAD' ? 400 : 409,
    }
    render(<App />)

    await loginAsUser(user)
    await user.click(screen.getByRole('button', { name: '설정' }))
    installQrScannerMock(rawValue)
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(expectedMessage)
    })
    expect(findWearablePairingCompleteCalls()).toHaveLength(1)
  })

  it('surfaces backend unreachable guidance while keeping the scanner recoverable', async () => {
    const user = userEvent.setup()
    const rawValue =
      'lg-able-band://pair?pairingSessionId=pairing-network-260612&deviceId=able-band-network-001&pairingCode=ABLE-4IN-260610&nonce=nonce-network-001&source=wearable'
    window.__ABLE_BAND_PAIRING_NETWORK_DOWN__ = true
    render(<App />)

    await loginAsUser(user)
    await user.click(screen.getByRole('button', { name: '설정' }))
    installQrScannerMock(rawValue)
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        '백엔드 서버에 연결할 수 없습니다.',
      )
    })
    expect(findWearablePairingCompleteCalls()).toHaveLength(1)
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
          name: '엘지',
          email: 'user@example.com',
        },
        userProfile: {
          userId: 1,
          name: '엘지',
          accessibilityType: 'VISUAL',
        },
      }),
    )

    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('heading', { name: /엘지 홈/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /able band 로그인/i })).toBeNull()
    await user.click(screen.getByRole('button', { name: '설정' }))
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
    expect(screen.getByText('오늘의 안전 상태')).toBeTruthy()
    expect(screen.getByText('방금')).toBeTruthy()
    expect(screen.getByRole('button', { name: '홈 정보 새로고침' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '사용자에게 연락' })).toBeNull()
    expect(screen.queryByText('빠른 보호자 대응')).toBeNull()
  })

  it('shows guardian danger details through recent delivery history', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
    expect(screen.queryByText('발생 위치')).toBeNull()
    expect(screen.queryByText('확인 상태')).toBeNull()
    expect(screen.getByText('최근 전달 알림')).toBeTruthy()
    expect(screen.getAllByText('주방에서 위험 신호가 감지되었습니다. 보호자에게도 전달됩니다.').length)
      .toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/안전 전기레인지/).length).toBeGreaterThanOrEqual(1)
  })

  it('removes a guardian emergency request from recent delivery history when confirmed', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
    expect(screen.getByText('긴급 도움 요청')).toBeTruthy()
    expect(screen.getByText('사용자가 앱에서 긴급 지원을 요청했습니다.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '긴급 도움 요청 확인' }))

    expect(screen.queryByText('긴급 도움 요청')).toBeNull()
    expect(screen.queryByText('사용자가 앱에서 긴급 지원을 요청했습니다.')).toBeNull()
    expect(screen.getByText('최근 전달 알림')).toBeTruthy()
  })

  it('shows every guardian home section as safe when all delivery history is confirmed', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()

    for (const confirmButton of screen.getAllByRole('button', { name: /확인$/ })) {
      await user.click(confirmButton)
    }

    expect(screen.getAllByText('안전').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('오늘은 전달된 위험 알림이 없습니다.')).toBeTruthy()
    expect(screen.getByText('최근 위험 알림이 없습니다.')).toBeTruthy()
    expect(screen.getByText('최근 전달된 알림이 없습니다. 현재 상태는 안전입니다.')).toBeTruthy()
    expect(screen.queryByText('전기레인지 과열 주의')).toBeNull()
    expect(screen.queryByText('긴급 도움 요청')).toBeNull()
  })

  it('keeps confirmed guardian delivery history hidden after reopening the guardian home', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '긴급 도움 요청 확인' }))
    expect(screen.queryByText('긴급 도움 요청')).toBeNull()

    unmount()
    render(<App />)

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
    expect(screen.queryByText('긴급 도움 요청')).toBeNull()
    expect(screen.queryByText('사용자가 앱에서 긴급 지원을 요청했습니다.')).toBeNull()
  })

  it('shows a safe guardian history state when there are no danger alerts', async () => {
    const user = userEvent.setup()
    window.__ABLE_BAND_GUARDIAN_DASHBOARD_EMPTY_ALERTS__ = true
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
    expect(screen.getAllByText('안전').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('최근 위험 알림이 없습니다.')).toBeTruthy()
    expect(screen.getByText('최근 전달된 알림이 없습니다. 현재 상태는 안전입니다.')).toBeTruthy()
  })

  it('shows the LG Able Band logo while the guardian dashboard is loading', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByAltText('LG Able Band')).toBeTruthy()
    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
  })

  it('falls back to mock guardian dashboard data when backend is unavailable', async () => {
    const user = userEvent.setup()
    window.__ABLE_BAND_GUARDIAN_DASHBOARD_NETWORK_DOWN__ = true
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
    expect(screen.getByText('긴급 도움 요청이 진행 중입니다.')).toBeTruthy()
    expect(screen.getByText('방금')).toBeTruthy()
    expect(screen.queryByText(/위험 알림 \d+건/)).toBeNull()
    expect(screen.queryByText('빠른 보호자 대응')).toBeNull()
  })

  it('shows the backend guardian dashboard error in strict mode', async () => {
    const user = userEvent.setup()
    window.__ABLE_BAND_GUARDIAN_DASHBOARD_STRICT__ = true
    window.__ABLE_BAND_GUARDIAN_DASHBOARD_ERROR__ = {
      status: 500,
      code: 'RESOURCE_NOT_FOUND',
      message: '보호자 대시보드를 찾을 수 없습니다.',
    }
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect((await screen.findByRole('alert')).textContent).toContain(
      '보호자 대시보드를 찾을 수 없습니다.',
    )
    expect(screen.queryByRole('heading', { name: '보호자 홈' })).toBeNull()
    expect(screen.queryByText('긴급 도움 요청이 진행 중입니다.')).toBeNull()
  })

  it('refreshes the guardian dashboard only when the refresh button is clicked', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
    expect(findFetchCalls('/api/guardians/dashboard')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '홈 정보 새로고침' }))

    await waitFor(() => {
      expect(findFetchCalls('/api/guardians/dashboard')).toHaveLength(2)
    })
  })

  it('falls back to jsQR when BarcodeDetector is unavailable for wearable pairing', async () => {
    const user = userEvent.setup()
    const rawValue =
      'lg-able-band://pair?pairingSessionId=pairing-jsqr-260611&deviceId=able-band-demo-001&pairingCode=ABLE-4IN-260610&nonce=nonce-jsqr-001&source=wearable'
    window.__ABLE_BAND_QR_DECODER__ = vi.fn(() => rawValue)
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '설정' }))
    installQrScannerMock(rawValue, { detector: false })
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('웨어러블 연동이 완료되었습니다.')
    })
    expect(window.__ABLE_BAND_QR_DECODER__).toHaveBeenCalled()
    expect(findFetchCall('/api/wearable/pairing-sessions/pairing-jsqr-260611/complete', 'POST')).toBeTruthy()
  })

  it('retries an alternate camera when the first camera stream has no visible frames', async () => {
    const user = userEvent.setup()
    const rawValue =
      'lg-able-band://pair?pairingSessionId=pairing-camera-retry-260611&deviceId=able-band-demo-001&pairingCode=ABLE-4IN-260610&nonce=nonce-camera-retry&source=wearable'
    const getUserMedia = vi.fn()
    let cameraAttempt = 0
    window.__ABLE_BAND_CAMERA_FRAME_TIMEOUT_MS__ = 10

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: getUserMedia.mockImplementation(async () => {
          cameraAttempt += 1
          return {
            getTracks: () => [{ stop: vi.fn() }],
          }
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
      get: () => (cameraAttempt >= 2 ? 640 : 0),
    })
    Object.defineProperty(window.HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => (cameraAttempt >= 2 ? 480 : 0),
    })
    vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(640 * 480 * 4),
        width: 640,
        height: 480,
      })),
    })
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: class MockBarcodeDetector {
        async detect() {
          return [{ rawValue }]
        }
      },
    })

    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('웨어러블 연동이 완료되었습니다.')
    })
    expect(getUserMedia).toHaveBeenNthCalledWith(1, { video: true })
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
  })

  it('uses the Vite camera frame timeout override when the first stream has no visible frames', async () => {
    const user = userEvent.setup()
    const rawValue =
      'lg-able-band://pair?pairingSessionId=pairing-vite-timeout-260612&deviceId=able-band-demo-001&pairingCode=ABLE-4IN-260610&nonce=nonce-vite-timeout&source=wearable'
    const getUserMedia = vi.fn()
    let cameraAttempt = 0
    import.meta.env.VITE_CAMERA_FRAME_TIMEOUT_MS = '10'

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: getUserMedia.mockImplementation(async () => {
          cameraAttempt += 1
          return {
            getTracks: () => [{ stop: vi.fn() }],
          }
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
      get: () => (cameraAttempt >= 2 ? 640 : 0),
    })
    Object.defineProperty(window.HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => (cameraAttempt >= 2 ? 480 : 0),
    })
    vi.spyOn(window.HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(640 * 480 * 4),
        width: 640,
        height: 480,
      })),
    })
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: class MockBarcodeDetector {
        async detect() {
          return [{ rawValue }]
        }
      },
    })

    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('웨어러블 연동이 완료되었습니다.')
    })
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
  })

  it('prefers a physical webcam over virtual camera devices', async () => {
    const user = userEvent.setup()
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    })

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          {
            kind: 'videoinput',
            label: 'Mirametrix Virtual Camera',
            deviceId: 'virtual-camera',
          },
          {
            kind: 'videoinput',
            label: 'USB webcam (0408:2098)',
            deviceId: 'usb-webcam',
          },
        ]),
        getUserMedia,
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
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(640 * 480 * 4),
        width: 640,
        height: 480,
      })),
    })
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: class MockBarcodeDetector {
        async detect() {
          return []
        }
      },
    })

    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('카메라가 켜졌습니다.')
    })
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        deviceId: {
          exact: 'usb-webcam',
        },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
  })

  it('prefers the rear camera on touch devices when a rear camera is available', async () => {
    const user = userEvent.setup()
    const originalUserAgentData = navigator.userAgentData
    const originalMaxTouchPoints = navigator.maxTouchPoints
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    })

    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: {
        mobile: true,
      },
    })
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          {
            kind: 'videoinput',
            label: 'Front Camera',
            deviceId: 'front-camera',
          },
          {
            kind: 'videoinput',
            label: 'Rear Camera',
            deviceId: 'rear-camera',
          },
        ]),
        getUserMedia,
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
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(640 * 480 * 4),
        width: 640,
        height: 480,
      })),
    })
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: class MockBarcodeDetector {
        async detect() {
          return []
        }
      },
    })

    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('카메라가 켜졌습니다.')
    })
    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        deviceId: {
          exact: 'rear-camera',
        },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })

    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: originalMaxTouchPoints,
    })
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      value: originalUserAgentData,
    })
  })

  it('throttles jsQR fallback when native detection keeps missing for wearable pairing', async () => {
    const user = userEvent.setup()
    const rawValue =
      'lg-able-band://pair?pairingSessionId=pairing-throttle-260619&deviceId=able-band-demo-001&pairingCode=ABLE-4IN-260610&nonce=nonce-throttle&source=wearable'
    const detectorDetect = vi.fn(async () => [])
    const rafCallbacks = []
    let now = 1000

    window.__ABLE_BAND_QR_DECODER__ = vi.fn(() => '')
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})

    installQrScannerMock(rawValue, { detect: detectorDetect })
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /엘지 홈/i })
    await user.click(screen.getByRole('button', { name: '설정' }))
    await user.click(screen.getByRole('button', { name: /카메라로 밴드 QR코드 스캔/ }))
    await user.click(screen.getByRole('button', { name: '카메라 켜기' }))

    await waitFor(() => {
      expect(detectorDetect).toHaveBeenCalledTimes(1)
    })
    expect(window.__ABLE_BAND_QR_DECODER__).toHaveBeenCalledTimes(1)

    now += 60
    await rafCallbacks.shift()?.()
    now += 60
    await rafCallbacks.shift()?.()
    now += 60
    await rafCallbacks.shift()?.()

    expect(detectorDetect).toHaveBeenCalledTimes(4)
    expect(window.__ABLE_BAND_QR_DECODER__).toHaveBeenCalledTimes(2)
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
  let homeSummary = structuredClone(mockHomeSummary)
  let alerts = structuredClone(mockAppPreview.alerts)
  let devices = structuredClone(mockAppPreview.devices)
  const accounts = new Map([
    [
      'USER:user@example.com',
      {
        role: 'USER',
        email: 'user@example.com',
        password: 'password1234',
        accountId: 1,
        name: '엘지',
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
    [
      'USER:admin@example.com',
      {
        role: 'USER',
        email: 'admin@example.com',
        password: 'password1234',
        accountId: 9,
        name: '관리자',
        userId: 9,
        accessibilityType: 'VISUAL',
        accessToken: 'api-user-token-admin',
      },
    ],
  ])
  const adminAlertTemplates = [
    {
      templateId: 'demo-danger',
      categoryName: '시연 알림',
      featureName: '위험 알림',
      title: '전기레인지 과열 주의',
      message: '주방에서 위험 신호가 감지되었습니다.',
    },
  ]
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

      return jsonResponse(homeSummary)
    }

    if (url === `${API_BASE_URL}/api/alerts?limit=20` && method === 'GET') {
      return jsonResponse({ items: alerts })
    }

    if (url === `${API_BASE_URL}/api/devices` && method === 'GET') {
      return jsonResponse({ items: devices })
    }

    if (url === `${API_BASE_URL}/api/admin/alert-templates` && method === 'GET') {
      return jsonResponse({ items: adminAlertTemplates })
    }

    if (url === `${API_BASE_URL}/api/admin/alerts/broadcast` && method === 'POST') {
      return jsonResponse({
        templateId: body.templateId,
        audience: body.audience,
        dispatchedUserCount: body.audience === 'ALL' ? 2 : 1,
      })
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
      if (window.__ABLE_BAND_EMERGENCY_ERROR__) {
        const error = window.__ABLE_BAND_EMERGENCY_ERROR__
        return jsonResponse(
          { code: error.code, message: error.message, details: {} },
          { status: error.status || 409 },
        )
      }

      const emergencyAlert = {
        alertId: 301,
        type: 'EMERGENCY',
        severity: 'CRITICAL',
        title: '긴급 지원 요청 접수',
        message: body.message,
        deviceName: 'Able Band 앱',
        occurredAt: '2026-06-10T14:35:00+09:00',
        status: 'ESCALATED',
      }
      alerts = [emergencyAlert, ...alerts]
      homeSummary = {
        ...homeSummary,
        recentAlerts: [emergencyAlert, ...homeSummary.recentAlerts],
      }
      return jsonResponse(
        {
          emergencyRequestId: 301,
          status: 'SENT',
          message: body.message,
          source: 'APP',
          sentAt: '2026-06-10T14:35:00+09:00',
          guardianNotified: true,
        },
        { status: 201 },
      )
    }

    const pairingCompleteMatch = url.match(/\/api\/wearable\/pairing-sessions\/([^/]+)\/complete$/)
    if (pairingCompleteMatch && method === 'POST') {
      if (window.__ABLE_BAND_PAIRING_NETWORK_DOWN__) {
        throw new TypeError('network down')
      }

      if (window.__ABLE_BAND_PAIRING_ERROR__) {
        const error = window.__ABLE_BAND_PAIRING_ERROR__
        return jsonResponse(
          { code: error.code, message: error.message, details: {} },
          { status: error.status || 409 },
        )
      }

      if (!body.nonce || body.pairingCode !== 'ABLE-4IN-260610') {
        return jsonResponse(
          { code: 'INVALID_PAIRING_PAYLOAD', message: '연동 QR 정보가 올바르지 않습니다.', details: {} },
          { status: 400 },
        )
      }

      const wearableDevice = {
        deviceId: 13,
        name: 'LG Able Band',
        type: 'WEARABLE',
        connectionStatus: 'CONNECTED',
        vendor: 'LG',
        vendorDeviceId: body.deviceId,
        locationSupported: false,
        remoteEnabled: true,
      }
      devices = [...devices.filter((device) => device.vendorDeviceId !== wearableDevice.vendorDeviceId), wearableDevice]
      return jsonResponse({
        pairingSessionId: pairingCompleteMatch[1],
        status: 'PAIRED',
        device: wearableDevice,
        accessToken: window.__ABLE_BAND_PAIRING_ACCESS_TOKEN__ || 'api-user-token',
        message: '웨어러블 연동이 완료되었습니다.',
      })
    }

    if (url === `${API_BASE_URL}/api/guardians` && method === 'GET') {
      return jsonResponse({ items: guardians })
    }

    if (url === `${API_BASE_URL}/api/guardians` && method === 'POST') {
      const guardian = {
        guardianId: Math.max(0, ...guardians.map((item) => item.guardianId)) + 1,
        name: body.name,
        phone: body.phone,
        isPrimary: body.isPrimary,
        notifyOnDanger: body.notifyOnDanger,
        connectionStatus: 'CONNECTED',
      }

      if (guardian.isPrimary) {
        guardians = guardians.map((item) => ({ ...item, isPrimary: false }))
      }

      guardians = [...guardians, guardian]
      return jsonResponse(guardian, { status: 201 })
    }

    if (url === `${API_BASE_URL}/api/guardians/dashboard` && method === 'GET') {
      if (window.__ABLE_BAND_GUARDIAN_DASHBOARD_NETWORK_DOWN__) {
        throw new TypeError('network down')
      }

      if (window.__ABLE_BAND_GUARDIAN_DASHBOARD_ERROR__) {
        const error = window.__ABLE_BAND_GUARDIAN_DASHBOARD_ERROR__
        return jsonResponse(
          { code: error.code, message: error.message, details: {} },
          { status: error.status || 500 },
        )
      }

      const guardianDangerAlerts = window.__ABLE_BAND_GUARDIAN_DASHBOARD_EMPTY_ALERTS__
        ? []
        : mockAppPreview.alerts.filter(
          (alert) => alert.type === 'DANGER' || alert.severity === 'HIGH',
        )
      const guardianEmergencyRequests = window.__ABLE_BAND_GUARDIAN_DASHBOARD_EMPTY_ALERTS__
        ? []
        : [
          {
            emergencyRequestId: 301,
            status: 'SENT',
            message: '사용자가 앱에서 긴급 지원을 요청했습니다.',
            source: 'APP',
            sentAt: '2026-06-10T14:35:00+09:00',
            guardianNotified: true,
          },
        ]
      const hasGuardianDangerAlerts = guardianDangerAlerts.length > 0

      return jsonResponse({
        user: {
          userId: 1,
          name: '엘지',
          accessibilityType: 'VISUAL',
        },
        dangerAlerts: guardianDangerAlerts,
        emergencyRequests: guardianEmergencyRequests,
        summary: {
          unreadDangerAlertCount: guardianDangerAlerts.filter((alert) => alert.status === 'UNREAD').length,
          emergencyRequestCount: guardianEmergencyRequests.length,
          activeEmergency: hasGuardianDangerAlerts || guardianEmergencyRequests.length > 0,
          safetyMessage: hasGuardianDangerAlerts || guardianEmergencyRequests.length > 0
            ? '긴급 도움 요청이 진행 중입니다.'
            : '오늘은 전달된 위험 알림이 없습니다.',
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

function installQrScannerMock(rawValue, { detector = true, detect = null } = {}) {
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
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(640 * 480 * 4),
      width: 640,
      height: 480,
    })),
  })
  if (!detector) {
    Object.defineProperty(window, 'BarcodeDetector', {
      configurable: true,
      value: undefined,
    })
    return
  }

  Object.defineProperty(window, 'BarcodeDetector', {
    configurable: true,
    value: class MockBarcodeDetector {
      async detect() {
        if (detect) {
          return detect()
        }
        return [{ rawValue }]
      }
    },
  })
}

async function loginAsUser(user) {
  await user.click(screen.getByRole('radio', { name: '사용자' }))
  await user.type(screen.getByLabelText('이메일'), 'user@example.com')
  await user.type(screen.getByLabelText('비밀번호'), 'password1234')
  await user.click(screen.getByRole('button', { name: '로그인' }))
  await screen.findByRole('heading', { name: /엘지 홈/i })
}

function findFetchCall(path, method = 'GET') {
  return globalThis.fetch.mock.calls.find(([url, init = {}]) => {
    return url === `${API_BASE_URL}${path}` && (init.method || 'GET').toUpperCase() === method
  })
}

function findWearablePairingCompleteCalls() {
  return globalThis.fetch.mock.calls.filter(([url, init = {}]) => {
    return (
      url.startsWith(`${API_BASE_URL}/api/wearable/pairing-sessions/`) &&
      url.endsWith('/complete') &&
      (init.method || 'GET').toUpperCase() === 'POST'
    )
  })
}

function restoreCameraFrameTimeoutEnv() {
  if (ORIGINAL_CAMERA_FRAME_TIMEOUT_ENV === undefined) {
    delete import.meta.env.VITE_CAMERA_FRAME_TIMEOUT_MS
  } else {
    import.meta.env.VITE_CAMERA_FRAME_TIMEOUT_MS = ORIGINAL_CAMERA_FRAME_TIMEOUT_ENV
  }

  if (ORIGINAL_ABLE_BAND_CAMERA_FRAME_TIMEOUT_ENV === undefined) {
    delete import.meta.env.VITE_ABLE_BAND_CAMERA_FRAME_TIMEOUT_MS
    return
  }

  import.meta.env.VITE_ABLE_BAND_CAMERA_FRAME_TIMEOUT_MS = ORIGINAL_ABLE_BAND_CAMERA_FRAME_TIMEOUT_ENV
}

function findFetchCalls(path, method = 'GET') {
  return globalThis.fetch.mock.calls.filter(([url, init = {}]) => {
    return url === `${API_BASE_URL}${path}` && (init.method || 'GET').toUpperCase() === method
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

