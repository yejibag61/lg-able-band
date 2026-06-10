import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import { mockAccounts } from './mocks/authMock'

describe('App login to home flow', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network call'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('shows USER signup constraints before submitting mock signup', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect((await screen.findByRole('alert')).textContent).toContain('이름은 2자 이상 입력해주세요.')

    await user.type(screen.getByLabelText('이름'), '홍')
    await user.type(screen.getByLabelText('이메일'), 'bad-email')
    await user.type(screen.getByLabelText('비밀번호'), 'short')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'different')
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    const errorText = (await screen.findByRole('alert')).textContent
    expect(errorText).toContain('올바른 이메일 형식으로 입력해주세요.')
    expect(errorText).toContain('비밀번호는 8자 이상이며 영문과 숫자를 포함해야 합니다.')
    expect(errorText).toContain('비밀번호가 일치하지 않습니다.')
  })

  it('submits USER signup mock and returns to login with the new email filled', async () => {
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
    expect(screen.getByRole('status').textContent).toContain(
      '회원가입이 완료되었습니다. 로그인해주세요.',
    )
  })

  it('lets a newly signed up USER log in with the mock account', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '회원가입' }))
    await user.type(screen.getByLabelText('이름'), '박로그')
    await user.type(screen.getByLabelText('이메일'), 'loginable-user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.type(screen.getByLabelText('비밀번호 확인'), 'password1234')
    await user.click(screen.getByRole('button', { name: '가입하기' }))

    expect(await screen.findByRole('heading', { name: /able band 로그인/i })).toBeTruthy()
    const createdAccount = mockAccounts.find((account) => account.email === 'loginable-user@example.com')
    expect(createdAccount.password).toBeUndefined()
    expect(createdAccount.passwordHash).toBeTruthy()

    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: /able band 홈/i })).toBeTruthy()
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

    expect(await screen.findByRole('heading', { name: /able band 홈/i })).toBeTruthy()
    expect(screen.getByText('홍길동님, 현재 위험 알림이 없습니다.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeTruthy()
    expect(screen.getByText('오늘의 안전 상태')).toBeTruthy()
    expect(screen.getByText('안전')).toBeTruthy()
    expect(screen.getByText('현재 위험 알림이 없습니다.')).toBeTruthy()
    expect(screen.getByText('마지막 확인: 방금 전')).toBeTruthy()
    expect(screen.getByText('실시간 알림 요약')).toBeTruthy()
    expect(screen.getByRole('button', { name: '알림 전체 보기' })).toBeTruthy()
    expect(screen.getByText('기기 연결 상태')).toBeTruthy()
    expect(screen.getByText('연결된 기기 4/5개')).toBeTruthy()
    expect(screen.getByRole('button', { name: '기기 확인' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '긴급 도움 요청' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '긴급 도움 요청' }))
    expect(screen.getByRole('status').textContent).toContain(
      '보호자에게 도움 요청을 보냈습니다.',
    )
    expect(screen.getByRole('button', { name: '홈' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '알림' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '기기' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '메뉴' })).toBeTruthy()
  })

  it('lets a USER preview alerts, devices, and menu tabs after login', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '사용자' }))
    await user.type(screen.getByLabelText('이메일'), 'user@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByRole('heading', { name: /able band 홈/i })

    await user.click(screen.getByRole('button', { name: '알림' }))
    expect(screen.getByRole('heading', { name: '실시간 알림' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '다시 듣기' }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: '확인 완료' }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: '기기' }))
    expect(screen.getByRole('heading', { name: '기기와 UWB' })).toBeTruthy()
    expect(screen.getByText('UWB 위치 안내')).toBeTruthy()
    expect(screen.getByRole('button', { name: '위치 안내 시작' })).toBeTruthy()
    expect(screen.getByText('등록된 기기 3/10개')).toBeTruthy()
    const addDeviceButton = screen.getByRole('button', { name: 'Mock 기기 추가' })
    for (let count = 0; count < 7; count += 1) {
      await user.click(addDeviceButton)
    }
    expect(screen.getByText('등록된 기기 10/10개')).toBeTruthy()
    expect(addDeviceButton.disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('최대 10개까지 등록할 수 있습니다.')

    await user.click(screen.getByRole('button', { name: '메뉴' }))
    expect(screen.getByRole('heading', { name: '메뉴' })).toBeTruthy()
    expect(screen.getByText('접근성 설정')).toBeTruthy()
    expect(screen.getByText('시각장애인')).toBeTruthy()
    expect(screen.getByText('보호자 연결')).toBeTruthy()
  })

  it('routes GUARDIAN login to guardian placeholder', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('radio', { name: '보호자' }))
    await user.type(screen.getByLabelText('이메일'), 'guardian@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'password1234')
    await user.click(screen.getByRole('button', { name: '로그인' }))

    expect(await screen.findByRole('heading', { name: '보호자 화면 준비 중' })).toBeTruthy()
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
      expect(screen.getByRole('heading', { name: /able band 홈/i })).toBeTruthy()
    })
  })
})
