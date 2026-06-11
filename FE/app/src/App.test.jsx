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

    const signupCall = globalThis.fetch.mock.calls.find(([url]) => url.endsWith('/api/auth/signup'))
    expect(signupCall).toBeTruthy()
    expect(JSON.parse(signupCall[1].body)).toMatchObject({
      role: 'USER',
      name: '김사용',
      email: 'new-user@example.com',
      accessibilityType: 'VISUAL',
    })
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

    await user.click(screen.getByRole('checkbox', { name: '진동 안내' }))
    expect(screen.getByRole('checkbox', { name: '진동 안내' }).checked).toBe(false)
  })

  it('lets a newly signed up USER log in with the API account', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))
    await user.type(screen.getByLabelText('이름'), '박로그')
    await user.type(screen.getByLabelText('이메일'), 'loginable-user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'password1234')
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(await screen.findByRole('heading', { name: /able band 로그인/i })).toBeTruthy()

    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: /소희 홈/i })).toBeTruthy()
    expect(window.localStorage.getItem('lg-able-band.accessToken')).toBe('api-user-token-3')
  })

  it('shows GUARDIAN signup fields and validates phone and relationship', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))
    await user.click(screen.getByRole('radio', { name: '보호자' }))

    expect(screen.getByLabelText('연락처')).toBeTruthy()
    expect(screen.getByLabelText('관계')).toBeTruthy()

    await user.type(screen.getByLabelText('이름'), '김보호')
    await user.type(screen.getByLabelText('이메일'), 'guardian-new@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'password1234')
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    const errorText = (await screen.findByRole('alert')).textContent
    expect(errorText).toContain('연락처를 입력해주세요.')
    expect(errorText).toContain('관계를 입력해주세요.')
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
    expect(screen.getByText('소희님, 현재 위험 알림은 없습니다.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy()
    expect(screen.getByText('Able Band가 실시간 안전 상태를 확인 중입니다.')).toBeTruthy()
    expect(screen.getByText('오늘의 안전 상태')).toBeTruthy()
    expect(screen.getByText('안전')).toBeTruthy()
    expect(screen.getByText('현재 위험 알림은 없습니다.')).toBeTruthy()
    expect(screen.getByText('마지막 확인: 방금 전')).toBeTruthy()
    expect(screen.getByText('최근 알림 2건')).toBeTruthy()
    expect(screen.getByText('미확인 1건')).toBeTruthy()
    expect(screen.getByText('위험 1건')).toBeTruthy()
    expect(screen.getByText('실시간 알림 요약')).toBeTruthy()
    expect(screen.getByRole('button', { name: '알림 전체 보기' })).toBeTruthy()
    expect(screen.getByText('기기 연결 상태')).toBeTruthy()
    expect(screen.getByText('연결된 기기 4/6개')).toBeTruthy()
    expect(screen.getByText('UWB 가능 2개')).toBeTruthy()
    expect(screen.getByRole('button', { name: '기기 확인' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '긴급 지원 요청' })).toBeTruthy()

    const homeCall = globalThis.fetch.mock.calls.find(([url]) => url.endsWith('/api/app/home'))
    expect(homeCall).toBeTruthy()
    expect(new Headers(homeCall[1].headers).get('Authorization')).toBe('Bearer api-user-token')

    await user.click(screen.getByRole('button', { name: '긴급 지원 요청' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('보호자에게 긴급 요청을 보냈습니다.')
    })
  })

  it('lets a USER preview alerts, devices, menu, and living signal settings after login', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /소희 홈/i })

    await user.click(screen.getByRole('button', { name: '알림' }))
    expect(screen.getByRole('heading', { name: '실시간 알림' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '전체' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '미확인' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '위험' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '도어센서 장시간 열림 다시 듣기' })).toBeNull()
    expect(screen.getByRole('button', { name: '도어센서 장시간 열림 상세 보기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '도어센서 장시간 열림 확인 완료' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '도어센서 장시간 열림 상세 보기' }))
    expect(screen.getByRole('heading', { name: '도어센서 장시간 열림' })).toBeTruthy()
    expect(screen.getByLabelText('알림 안내').textContent).toContain(
      '현관문이 장시간 열려 있습니다. 문이 닫혔는지 확인하세요.',
    )
    expect(screen.getByLabelText('알림 안내').textContent).toContain(
      '현관문을 닫고 외출 전 잠금 상태를 확인하세요.',
    )
    expect(screen.queryByText('다시 듣기 문구')).toBeNull()
    expect(screen.queryByText('필요한 조치')).toBeNull()
    expect(await screen.findByText('전달된 알림')).toBeTruthy()
    expect(screen.getByText('밴드 진동')).toBeTruthy()
    expect(screen.getByText('반복 진동')).toBeTruthy()
    expect(screen.getByText('보호자에게도 전달됨')).toBeTruthy()
    expect(screen.queryByText('BASIC_REPEAT')).toBeNull()

    await user.click(screen.getByRole('button', { name: '다시 듣기' }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('알림 안내를 다시 들려드렸습니다.')
    })
    expect(window.speechSynthesis.speak).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '확인 완료' }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('확인 완료 처리했습니다.')
    })
    expect(screen.queryByText('도어센서 장시간 열림')).toBeNull()

    await user.click(screen.getByRole('button', { name: '생활' }))
    expect(screen.getByText('세탁 완료')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '기기' }))
    expect(screen.getByRole('heading', { name: '기기와 UWB' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '우리 집 가전을 연결해요.' })).toBeTruthy()
    expect(screen.getAllByText('UWB 위치 안내').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '위치 안내 시작' })).toBeTruthy()
    expect(screen.getByText('등록 현황')).toBeTruthy()
    expect(await screen.findByRole('button', { name: '세탁기 관리 열기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'TV 관리 열기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '안전 전기레인지 관리 열기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '도어센서 관리 열기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'LG 공기질 센서 관리 열기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '냉장고 관리 열기' })).toBeTruthy()
    expect(screen.getByText('세탁기 관리')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '안전 전기레인지 관리 열기' }))
    expect(screen.getByText('안전 전기레인지 관리')).toBeTruthy()
    expect(screen.getAllByText('잔열·과열 경고').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '주변 제품 찾기' }))
    expect(screen.getByRole('status').textContent).toContain('모든 가전이 이미 연결되어 있습니다.')

    await user.click(screen.getByRole('button', { name: '메뉴' }))
    expect(screen.getByRole('heading', { name: '메뉴' })).toBeTruthy()
    expect(screen.getByText('접근성 설정')).toBeTruthy()
    expect(screen.getByText('보호자 연결')).toBeTruthy()
    expect(screen.getByRole('button', { name: '멤버 초대' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '멤버 초대' }))
    expect(screen.getByRole('heading', { name: '보호자 연결' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '긴급 알림을 받을 보호자를 등록해요.' })).toBeTruthy()
    expect(screen.getByLabelText('이름').value).toBe('김보호')
    expect(screen.getByLabelText('연락처').value).toBe('010-0000-0000')
    await user.clear(screen.getByLabelText('이름'))
    await user.type(screen.getByLabelText('이름'), '정가족')
    await user.clear(screen.getByLabelText('연락처'))
    await user.type(screen.getByLabelText('연락처'), '010-2222-3333')
    await user.click(screen.getByRole('button', { name: '보호자 등록' }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('보호자 연결을 저장했습니다.')
    })
    expect(screen.getByText('정가족')).toBeTruthy()
    expect(screen.getByText('010-2222-3333')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '메뉴로 돌아가기' }))
    expect(screen.getByRole('button', { name: '멤버 초대' })).toBeTruthy()
    expect(screen.getAllByText('가족').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /생활 신호 설정/i })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /생활 신호 설정/i }))
    expect(screen.getAllByRole('heading', { name: '생활 신호 설정' }).length).toBeGreaterThan(0)
    expect(screen.getByText('등록된 알림음')).toBeTruthy()
    expect(screen.getByText('Front Door Bell')).toBeTruthy()
    expect(screen.getByText('주변 소리 감지')).toBeTruthy()
  })

  it('lets a USER update accessibility settings and applies global classes', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))
    await screen.findByRole('heading', { name: /소희 홈/i })

    const appScreen = document.querySelector('.app-screen')
    expect(appScreen.classList.contains('high-contrast')).toBe(true)
    expect(appScreen.classList.contains('large-text')).toBe(true)

    await user.click(screen.getByRole('button', { name: '메뉴' }))
    expect(screen.getByText('필요한 기능을 누르면 바로 적용됩니다.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '고대비 끄기' }))

    await waitFor(() => {
      expect(appScreen.classList.contains('high-contrast')).toBe(false)
      expect(screen.getByRole('status').textContent).toContain('접근성 설정을 저장했습니다.')
    })
    expect(screen.getByRole('button', { name: '고대비 켜기' })).toBeTruthy()

    const updateCall = globalThis.fetch.mock.calls.find(
      ([url, init]) => url.endsWith('/api/users/me/accessibility') && init.method === 'PUT',
    )
    expect(JSON.parse(updateCall[1].body).notificationPrefs.highContrast).toBe(false)
    expect(
      JSON.parse(window.localStorage.getItem('lg-able-band.accessibilitySettings.user@example.com'))
        .highContrast,
    ).toBe(false)
  })

  it('routes GUARDIAN login to guardian placeholder', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 홈' })).toBeTruthy()
    expect(screen.getByText('긴급 도움 요청')).toBeTruthy()
    expect(screen.getByText('위험 알림')).toBeTruthy()
    expect(screen.queryByText('전송됨')).toBeNull()
    expect(screen.getByRole('button', { name: '사용자에게 연락' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '도움 요청 확인' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '사용자에게 연락' }))
    expect(screen.getByRole('heading', { name: '소희님에게 연락합니다.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '전화 걸기' })).toBeTruthy()
    expect(screen.getByText('권장 확인 문장')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '긴급 요청 상세를 확인해요.' })).toBeNull()
    expect(screen.queryByRole('heading', { name: /able band 홈/i })).toBeNull()
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
    expect(screen.getByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
  })

  it('keeps login button disabled while submitting', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(screen.getByRole('button', { name: '로그인 중...' }).disabled).toBe(true)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /소희 홈/i })).toBeTruthy()
    })
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
      const isKnownUserToken = authorization === 'Bearer api-user-token' || authorization?.startsWith('Bearer api-user-token-')

      if (!isKnownUserToken) {
        return jsonResponse(
          { code: 'UNAUTHORIZED', message: 'Authorization 헤더가 필요합니다.', details: {} },
          { status: 401 },
        )
      }

      return jsonResponse(mockHomeSummary)
    }

    if (url === `${API_BASE_URL}/api/users/me` && method === 'GET') {
      return jsonResponse({
        role: 'USER',
        userId: 1,
        name: '소희',
        email: 'user@example.com',
        accessibilityType: 'VISUAL',
        notificationPrefs: {
          channels: ['VOICE', 'VIBRATION'],
          highContrast: true,
          largeText: true,
        },
        guardianLinked: true,
      })
    }

    if (url === `${API_BASE_URL}/api/users/me/accessibility` && method === 'PUT') {
      return jsonResponse({
        accessibilityType: body.accessibilityType,
        notificationPrefs: body.notificationPrefs,
        updatedAt: '2026-06-11T12:00:00+09:00',
      })
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
          decisionSource: 'AI',
          emergencyLevel: 'CRITICAL',
        },
        { status: 201 },
      )
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

      return jsonResponse(
        {
          guardianId: account.guardianId,
          name: account.name,
          phone: account.phone || '',
          isPrimary: body.isPrimary,
          notifyOnDanger: body.notifyOnDanger,
          connectionStatus: 'CONNECTED',
        },
        { status: 201 },
      )
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
